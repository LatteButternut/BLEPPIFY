import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGeminiClient(timeoutMs = 30000): GoogleGenAI {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY_ ||
    process.env.API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error('Server GEMINI_API_KEY is not configured.');
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      timeout: timeoutMs,
      retryOptions: { attempts: 1 },
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

type PartInput =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

interface StoredPdfEntry {
  id: string;
  name?: string;
  mimeType: string;
  base64Data: string;
}

interface UploadedFileHandle {
  uri: string;
  mimeType: string;
  expiresAt: number;
}

const pdfStoreById = new Map<string, StoredPdfEntry>();
const geminiFileCacheByHash = new Map<string, Promise<UploadedFileHandle | null>>();
const modelCooldownUntil = new Map<string, number>();

const FAST_JSON_MODELS = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
];

const VISION_MODELS = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
];

function hashBase64(base64Data: string): string {
  return crypto.createHash('sha256').update(base64Data).digest('hex');
}

function hydratePdfStoreFromDisk(): StoredPdfEntry[] {
  return [];
}

async function getOrUploadGeminiPdfHandle(
  ai: GoogleGenAI,
  mimeType: string,
  base64Data: string
): Promise<UploadedFileHandle | null> {
  const hash = hashBase64(base64Data);
  const existingPromise = geminiFileCacheByHash.get(hash);
  if (existingPromise) {
    const existing = await existingPromise;
    if (existing && existing.expiresAt > Date.now()) {
      return existing;
    }
    geminiFileCacheByHash.delete(hash);
  }

  const uploadTask = (async (): Promise<UploadedFileHandle | null> => {
    try {
      const bytes = Buffer.from(base64Data, 'base64');
      const blob = new Blob([bytes], { type: mimeType || 'application/pdf' });
      const uploaded = await ai.files.upload({
        file: blob,
        config: {
          mimeType: mimeType || 'application/pdf',
        },
      });
      if (uploaded?.uri) {
        return {
          uri: uploaded.uri,
          mimeType: uploaded.mimeType || mimeType || 'application/pdf',
          // Gemini Files API retains files for 48h; refresh after 40h
          expiresAt: Date.now() + 40 * 60 * 60 * 1000,
        };
      }
      return null;
    } catch {
      return null;
    }
  })();

  geminiFileCacheByHash.set(hash, uploadTask);
  const resolved = await uploadTask;
  if (!resolved) {
    geminiFileCacheByHash.delete(hash);
  }
  return resolved;
}

async function resolvePdfParts(
  ai: GoogleGenAI,
  pdfFiles: Array<{ id?: string; name?: string; mimeType?: string; base64Data?: string }>
): Promise<{ parts: PartInput[]; missingIds: string[] }> {
  if (!Array.isArray(pdfFiles) || pdfFiles.length === 0) {
    return { parts: [], missingIds: [] };
  }

  const missingIds: string[] = [];
  const resolvedEntries: Array<{ mimeType: string; base64Data: string }> = [];

  for (const pdf of pdfFiles) {
    if (!pdf) continue;
    const mimeType = pdf.mimeType || 'application/pdf';
    if (typeof pdf.base64Data === 'string' && pdf.base64Data.length > 0) {
      if (pdf.id) {
        pdfStoreById.set(pdf.id, {
          id: pdf.id,
          name: pdf.name,
          mimeType,
          base64Data: pdf.base64Data,
        });
      }
      resolvedEntries.push({ mimeType, base64Data: pdf.base64Data });
      continue;
    }

    if (pdf.id) {
      let cached = pdfStoreById.get(pdf.id);
      if (!cached) {
        hydratePdfStoreFromDisk();
        cached = pdfStoreById.get(pdf.id);
      }
      if (cached) {
        resolvedEntries.push({
          mimeType: cached.mimeType || mimeType,
          base64Data: cached.base64Data,
        });
      } else {
        missingIds.push(pdf.id);
      }
    }
  }

  if (missingIds.length > 0) {
    return { parts: [], missingIds };
  }

  const parts = await Promise.all(
    resolvedEntries.map(async (entry): Promise<PartInput> => {
      const handle = await getOrUploadGeminiPdfHandle(ai, entry.mimeType, entry.base64Data);
      if (handle) {
        return {
          fileData: {
            mimeType: handle.mimeType,
            fileUri: handle.uri,
          },
        };
      }
      return {
        inlineData: {
          mimeType: entry.mimeType,
          data: entry.base64Data,
        },
      };
    })
  );

  return { parts, missingIds: [] };
}

async function generateWithFallback(
  ai: GoogleGenAI,
  contents: { parts: PartInput[] },
  config: Record<string, unknown>,
  preferLowThinkingLatency = false
) {
  const candidates = preferLowThinkingLatency ? FAST_JSON_MODELS : VISION_MODELS;
  const now = Date.now();
  const activeCandidates = candidates.filter((m) => (modelCooldownUntil.get(m) || 0) <= now);
  const orderedModels = activeCandidates.length > 0 ? activeCandidates : candidates;

  let lastError: unknown = null;
  for (const model of orderedModels) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents,
        config,
      });
      modelCooldownUntil.delete(model);
      return res;
    } catch (err) {
      lastError = err;
      modelCooldownUntil.set(model, Date.now() + 5 * 60 * 1000);
    }
  }
  throw lastError;
}

function prewarmActivePdfsInBackground(entries: StoredPdfEntry[]): void {
  if (entries.length === 0) return;
  try {
    const ai = getGeminiClient(45000);
    for (const entry of entries) {
      void getOrUploadGeminiPdfHandle(ai, entry.mimeType, entry.base64Data);
    }
  } catch {
    // Ignore missing API key during cold boot or health checks
  }
}

export const app = express();

// Support large base64 PDF and OMR photo payloads
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/public-config', (_req, res) => {
  const supabaseUrl = (
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();
  const supabaseAnonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();
  res.json({ supabaseUrl, supabaseAnonKey });
});

// Stateless no-op compatibility routes (state is stored in Supabase user_data)
app.get('/api/cloud-state', (_req, res) => {
  res.json({ state: null });
});

app.post('/api/cloud-state', (_req, res) => {
  res.json({ ok: true, updatedAt: Date.now() });
});

// Authenticated Supabase Account & user_data Deletion Route
app.post('/api/account/delete', async (req, res) => {
  try {
    const supabaseUrl = (
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      ''
    ).trim();
    const supabaseAnonKey = (
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ''
    ).trim();
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      res.json({ ok: true, localOnly: true });
      return;
    }

    const authHeader = String(req.headers.authorization || '');
    const accessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';

    if (!accessToken) {
      res.status(401).json({ error: 'Missing Authorization Bearer token.' });
      return;
    }

    const authVerifier = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: verifyErr } = await authVerifier.auth.getUser(accessToken);
    if (verifyErr || !userData?.user?.id) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }

    const verifiedUserId = userData.user.id;

    // 1. Delete user_id row from public.user_data using user-scoped JWT
    const userScopedClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
    await userScopedClient.from('user_data').delete().eq('user_id', verifiedUserId);

    // 2. If SUPABASE_SERVICE_ROLE_KEY is configured, enforce admin deletion from public.user_data and auth.users
    let authUserDeleted = false;
    if (serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      await adminClient.from('user_data').delete().eq('user_id', verifiedUserId);
      const { error: deleteAuthErr } = await adminClient.auth.admin.deleteUser(verifiedUserId);
      authUserDeleted = !deleteAuthErr;
    }

    res.json({
      ok: true,
      userId: verifiedUserId,
      userDataDeleted: true,
      authUserDeleted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete account.';
    res.status(500).json({ error: message });
  }
});

// 0b. Register/Cache Uploaded PDFs Once Before Parallel Sub-Batch Requests
app.post('/api/gemini/register-pdfs', async (req, res) => {
  try {
    const { checkIds = [], pdfFiles = [] } = req.body || {};

    if (Array.isArray(checkIds) && checkIds.length > 0 && (!Array.isArray(pdfFiles) || pdfFiles.length === 0)) {
      const missingIds: string[] = [];
      for (const rawId of checkIds) {
        const id = String(rawId || '');
        if (!id) continue;
        if (!pdfStoreById.has(id)) {
          hydratePdfStoreFromDisk();
        }
        if (!pdfStoreById.has(id)) {
          missingIds.push(id);
        }
      }
      res.json({ ok: true, missingIds });
      return;
    }

    const ai = getGeminiClient(45000);
    if (Array.isArray(pdfFiles)) {
      await Promise.all(
        pdfFiles.map(async (pdf: { id?: string; name?: string; mimeType?: string; base64Data?: string }) => {
          if (!pdf?.base64Data) return;
          const mimeType = pdf.mimeType || 'application/pdf';
          if (pdf.id) {
            pdfStoreById.set(pdf.id, {
              id: pdf.id,
              name: pdf.name,
              mimeType,
              base64Data: pdf.base64Data,
            });
          }
          await getOrUploadGeminiPdfHandle(ai, mimeType, pdf.base64Data);
        })
      );
    }

    res.json({ ok: true, missingIds: [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to register PDF files.';
    res.status(500).json({ error: message });
  }
});

// 1. Generate 5 Flashcards from PDF / PRC TOS Competency
app.post('/api/gemini/flashcards', async (req, res) => {
  try {
    const {
      subjectTitle,
      sectionTitle,
      competencyText,
      lockedSectionLetter = '',
      lockedSectionTitle = '',
      excludedSectionsDetails = '',
      domainBoundaryNote = '',
      count = 5,
      excludeTerms = [],
      pdfFiles = [],
    } = req.body;
    const ai = getGeminiClient(30000);

    const { parts: pdfParts, missingIds } = await resolvePdfParts(ai, pdfFiles);
    if (missingIds.length > 0) {
      res.status(409).json({ error: 'PDF cache miss', code: 'PDF_CACHE_MISS', missingIds });
      return;
    }

    const parts: PartInput[] = [...pdfParts];

    const safeCount = Math.min(15, Math.max(1, Number(count) || 5));
    const cleanLockedLetter =
      typeof lockedSectionLetter === 'string' && /^[A-Fa-f]$/.test(lockedSectionLetter.trim())
        ? lockedSectionLetter.trim().toUpperCase()
        : '';

    const priorTermsBlock =
      Array.isArray(excludeTerms) && excludeTerms.length > 0
        ? `\nSTRICT NON-REPETITION RULE: Do NOT repeat or slightly reword any of these previously studied flashcard concepts:\n${excludeTerms
            .slice(0, 30)
            .map((t: unknown) => `- ${String(t).slice(0, 100)}`)
            .join('\n')}\nChoose fresh concepts or differentiations within the target competencies.\n`
        : '';

    const flashcardIsolationBlock = cleanLockedLetter
      ? `\nGRADUAL LEARNING — SINGLE-SECTION ISOLATION RULE:
Generate flashcards EXCLUSIVELY for Section ${cleanLockedLetter}: ${lockedSectionTitle || sectionTitle}.
Do NOT include concepts, stages, theories, methods, or laws from any other section so the student's learning stays strictly gradual.
${typeof domainBoundaryNote === 'string' && domainBoundaryNote.trim() ? `${domainBoundaryNote.trim()}\n` : ''}${
          typeof excludedSectionsDetails === 'string' && excludedSectionsDetails.trim()
            ? `OFF-LIMITS SIBLING SECTIONS (DO NOT INCLUDE):\n${excludedSectionsDetails.trim()}\n`
            : ''
        }`
      : '';

    const flashcardGroundingInstruction =
      pdfParts.length > 0
        ? cleanLockedLetter
          ? `PDF CHAPTER ISOLATION RULE: The attached PDF reviewer covers the entire subject across all sections. Consult ONLY the pages/passages directly covering Section ${cleanLockedLetter} (${lockedSectionTitle || sectionTitle}) and completely IGNORE all other chapters, stages, theories, or sections in the PDF. If the PDF only briefly covers Section ${cleanLockedLetter}, supplement strictly within Section ${cleanLockedLetter}'s own concepts using standard BLEPP references.`
          : 'Ground the concepts, terms, case applications, and mnemonics directly in the attached PDF reviewer document(s).'
        : 'Use standard Philippine BLEPP board exam reference textbooks (Papalia, Santrock, Cohen & Swerdlik, Kaplan & Saccuzzo, Barlow & Durand, DSM-5-TR, Aamodt, Spector, RA 11036 Philippine Mental Health Law, and the PAP Code of Ethics).';

    const promptText = `You are an official Philippine Psychometrician Licensure Examination (BLEPP - PRC Annex B PQF Level 6) reviewer author.
Subject: ${subjectTitle}
Target PRC TOS Section: ${sectionTitle}
Specific Competency Focus: ${competencyText}
${flashcardIsolationBlock}
Generate ${safeCount} high-yield board exam study flashcards strictly aligned with the PRC Table of Specifications above.
${priorTermsBlock}${flashcardGroundingInstruction}

Return a JSON array of flashcards.`;

    parts.push({ text: promptText });

    const response = await generateWithFallback(
      ai,
      { parts },
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: {
                type: Type.STRING,
                description: 'Key concept, diagnostic entity, psychometric principle, or situational prompt on the front of the card.',
              },
              definition: {
                type: Type.STRING,
                description: 'Concise board-focused explanation, key differentiation, and memory aid on the back of the card (2-3 crisp sentences).',
              },
              tosCode: {
                type: Type.STRING,
                description: 'The PRC TOS Section & Competency code (e.g., "Section A · 1.1 Heredity & Environment").',
              },
              bloomsLevel: {
                type: Type.STRING,
                description: 'One of: Remembering, Understanding, Applying, Analyzing, Evaluating, Creating.',
              },
            },
            required: ['term', 'definition', 'tosCode', 'bloomsLevel'],
          },
        },
      },
      true
    );

    const rawText = (response.text ?? '[]').trim();
    const cards = JSON.parse(rawText);
    res.json({ flashcards: cards });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate flashcards from Gemini API.';
    res.status(500).json({ error: message });
  }
});

// 2. Generate 15-Item Practice Quiz / 100-Item 3-Hour Mock Board Exam Questions
app.post('/api/gemini/questions', async (req, res) => {
  try {
    const {
      subjectTitle,
      scopeTitle,
      competencyDetails,
      count = 15,
      difficultyFilter = 'TOS_PROPORTIONAL',
      lockedSectionLetter = '',
      lockedSectionTitle = '',
      excludedSectionsDetails = '',
      domainBoundaryNote = '',
      batchFocusHint = '',
      excludeStems = [],
      compactMode = false,
      pdfFiles = [],
    } = req.body;

    const ai = getGeminiClient(35000);
    const { parts: pdfParts, missingIds } = await resolvePdfParts(ai, pdfFiles);
    if (missingIds.length > 0) {
      res.status(409).json({ error: 'PDF cache miss', code: 'PDF_CACHE_MISS', missingIds });
      return;
    }

    const parts: PartInput[] = [...pdfParts];

    const safeCount = Math.min(35, Math.max(1, Number(count) || 15));
    const cleanLockedLetter =
      typeof lockedSectionLetter === 'string' && /^[A-Fa-f]$/.test(lockedSectionLetter.trim())
        ? lockedSectionLetter.trim().toUpperCase()
        : '';

    const difficultyInstruction =
      difficultyFilter === 'TOS_PROPORTIONAL'
        ? "Enforce PRC BLEPP Bloom's Taxonomy rigor across Remembering/Understanding (30%), Applying Philippine situational vignettes (40%), and Analyzing/Evaluating differential cases (30%)."
        : `Focus strictly on ${difficultyFilter} level questions.`;

    const batchFocusDirective =
      typeof batchFocusHint === 'string' && batchFocusHint.trim()
        ? `\nSUB-BATCH COGNITIVE & SCENARIO ASSIGNMENT:\n${batchFocusHint.trim()}\n`
        : '';

    const boundaryClarifierText =
      typeof domainBoundaryNote === 'string' && domainBoundaryNote.trim()
        ? `\n${domainBoundaryNote.trim()}\n`
        : '';

    const excludedSectionsBlock =
      typeof excludedSectionsDetails === 'string' && excludedSectionsDetails.trim()
        ? `\nOFF-LIMITS SIBLING SECTIONS IN THIS SUBJECT (RESERVED FOR OTHER QUIZZES — DO NOT USE ANY CONCEPT BELOW IN STEMS OR OPTIONS):\n${excludedSectionsDetails.trim()}\n`
        : '';

    const sectionLockDirective = cleanLockedLetter
      ? `\nGRADUAL LEARNING — STRICT SINGLE-SECTION ISOLATION (CRITICAL — ZERO CROSS-SECTION BLEED):
You are generating questions EXCLUSIVELY for Section ${cleanLockedLetter}: ${lockedSectionTitle || scopeTitle}.
- The learner is mastering this subject gradually, one section at a time. Do NOT pull in "kinda related" topics from later or adjacent sections!
- 100% of every item — the question stem/vignette, the keyed answer, AND all 3 distractor options (A, B, C, D) — MUST revolve strictly around the competencies listed above for Section ${cleanLockedLetter}.
- Even wrong choices (distractors) MUST be plausible concepts from WITHIN Section ${cleanLockedLetter}, NEVER stages, theories, disorders, methods, or ethics from other sections.
- Set "sectionCode" to "${cleanLockedLetter}" on every item.${boundaryClarifierText}${excludedSectionsBlock}`
      : '';

    const antiRepetitionDirective =
      Array.isArray(excludeStems) && excludeStems.length > 0
        ? `\nSTRICT ANTI-REPETITION DIRECTIVE:
Do NOT repeat, paraphrase, or reuse the same scenario or question stem from these prior items:
${excludeStems
  .slice(0, 25)
  .map((s: unknown) => `- ${String(s).replace(/\s+/g, ' ').trim().slice(0, 110)}`)
  .join('\n')}
Every item MUST present a 100% fresh angle, scenario, and mutually distinct concept.\n`
        : `\nVARIETY DIRECTIVE: Ensure all ${safeCount} items cover distinct sub-topics, mechanisms, or situational scenarios with zero repetitive stems.\n`;

    const lengthDirective = compactMode
      ? 'Keep each optionRationale to 1 crisp sentence and examTip to 1 crisp sentence.'
      : 'Keep each optionRationale to 1–2 sharp, context-specific sentences and examTip to 1–2 sharp sentences anchored to the stem.';

    const groundingInstruction =
      pdfParts.length > 0
        ? cleanLockedLetter
          ? `PDF CHAPTER ISOLATION RULE: The attached PDF reviewer covers the ENTIRE subject across all sections. Consult ONLY the pages/passages in the PDF that directly cover Section ${cleanLockedLetter} (${lockedSectionTitle || scopeTitle}) and its listed TOS competencies. Completely IGNORE all other chapters, developmental stages/tasks, theories, research methods, or sections in the PDF—even if they seem tangentially related. If the PDF only briefly covers Section ${cleanLockedLetter}, generate rich varied scenarios strictly within Section ${cleanLockedLetter}'s own concepts using standard BLEPP textbook principles rather than EVER pulling material from other chapters of the PDF.`
          : 'Ground concepts, theories, and cases in the attached PDF reviewer document(s) while strictly obeying the Exam Scope and TOS Competencies above.'
        : 'Ground items in official PRC Annex B competencies and standard Philippine board references (Papalia, Santrock, Cohen/Swerdlik, Kaplan & Saccuzzo, Barlow/Durand, DSM-5-TR, Aamodt, Spector, RA 11036 Mental Health Law, PAP Code of Ethics).';

    const promptText = `You are an official Philippine Psychometrician Licensure Examination (BLEPP - PRC Annex B, PQF Level 6) examiner.
Subject: ${subjectTitle}
Exam Scope: ${scopeTitle}
TOS Competencies Covered:
${competencyDetails}
${sectionLockDirective}${batchFocusDirective}${antiRepetitionDirective}
${difficultyInstruction}
${lengthDirective}
${groundingInstruction}

Generate exactly ${safeCount} multiple-choice board exam items.
For each item:
1. options: 4 realistic choices (A, B, C, D) with plausible look-alike distractors${cleanLockedLetter ? ` strictly belonging to Section ${cleanLockedLetter}` : ''}.
2. correctChoice: "A", "B", "C", or "D".
3. sectionCode: ${cleanLockedLetter ? `"${cleanLockedLetter}"` : '"A", "B", "C", "D", "E", or "F"'}.
4. tosCode: exact TOS code label.
5. bloomsLevel: "Remembering", "Understanding", "Applying", "Analyzing", "Evaluating", or "Creating".
6. optionRationales (A, B, C, D):
   - For correctChoice: explain WHY it is the BEST answer based on the exact contextual cues in the stem.
   - For each of the 3 wrong choices: explain WHY it is NOT the answer based on the specific context of the stem (clarifying why it is only partial, a look-alike trap, or contradicted by a stem cue).
7. examTip: write 2 sharp sentences anchored to the stem's specific scenario explaining WHY the correct choice is a fuller fit than the closest look-alike or partially fitting distractor in this question (NEVER write generic filler like "Bonus Takeaway: Watch for timeframe...").
IMPORTANT: NEVER mention "Section A/B/C/D/E/F" or TOS code numbers inside stem, optionRationales, or examTip.`;

    parts.push({ text: promptText });

    const response = await generateWithFallback(
      ai,
      { parts },
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              stem: {
                type: Type.STRING,
                description: 'The board exam question stem or situational vignette.',
              },
              options: {
                type: Type.OBJECT,
                properties: {
                  A: { type: Type.STRING },
                  B: { type: Type.STRING },
                  C: { type: Type.STRING },
                  D: { type: Type.STRING },
                },
                required: ['A', 'B', 'C', 'D'],
              },
              correctChoice: {
                type: Type.STRING,
                description: '"A", "B", "C", or "D".',
              },
              sectionCode: {
                type: Type.STRING,
                description: 'Single uppercase letter: "A", "B", "C", "D", "E", or "F".',
              },
              tosCode: {
                type: Type.STRING,
                description: 'Specific TOS identifier.',
              },
              bloomsLevel: {
                type: Type.STRING,
                description: 'Remembering, Understanding, Applying, Analyzing, Evaluating, or Creating.',
              },
              optionRationales: {
                type: Type.OBJECT,
                properties: {
                  A: { type: Type.STRING },
                  B: { type: Type.STRING },
                  C: { type: Type.STRING },
                  D: { type: Type.STRING },
                },
                required: ['A', 'B', 'C', 'D'],
              },
              examTip: {
                type: Type.STRING,
                description: 'Context-grounded summary of why the keyed choice is the best fit over look-alike options in this stem.',
              },
            },
            required: [
              'stem',
              'options',
              'correctChoice',
              'sectionCode',
              'tosCode',
              'bloomsLevel',
              'optionRationales',
              'examTip',
            ],
          },
        },
      },
      true
    );

    const rawText = (response.text ?? '[]').trim();
    const parsedQuestions = JSON.parse(rawText);
    const questions = Array.isArray(parsedQuestions)
      ? parsedQuestions.map((item: Record<string, unknown>) => {
          const key = ['A', 'B', 'C', 'D'].includes(String(item.correctChoice))
            ? (String(item.correctChoice) as 'A' | 'B' | 'C' | 'D')
            : 'A';
          const optRat = (item.optionRationales || {}) as Record<string, string>;
          const rawModelSec = String(item.sectionCode || '').trim().toUpperCase();
          const resolvedSectionCode = /^[A-F]$/.test(rawModelSec)
            ? rawModelSec
            : cleanLockedLetter || 'A';
          return {
            ...item,
            correctChoice: key,
            rationale:
              (typeof item.rationale === 'string' && item.rationale.trim()) ||
              optRat[key] ||
              (typeof item.examTip === 'string' ? item.examTip : ''),
            sectionCode: resolvedSectionCode,
          };
        })
      : [];
    res.json({ questions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate board exam items from Gemini API.';
    res.status(500).json({ error: message });
  }
});

// 3. Gemini Vision OMR Scanner for Uploaded or Camera-Scanned 150-Item (6 Columns x 25 Items) PRC Answer Sheet
app.post('/api/gemini/scan-prc-sheet', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', totalExamItems = 100 } = req.body;
    if (!imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64 payload.' });
      return;
    }

    const ai = getGeminiClient(60000);

    const visionPrompt = `You are an Optical Mark Recognition (OMR) scanner calibrated for the official Philippine Professional Regulation Commission (PRC) Examination Answer Sheet.
Layout Geometry of the 150-Item PRC Answer Sheet:
- 6 vertical columns of 25 items each (150 items total):
  * Column 1: Items 1 to 25
  * Column 2: Items 26 to 50
  * Column 3: Items 51 to 75
  * Column 4: Items 76 to 100
  * Column 5: Items 101 to 125
  * Column 6: Items 126 to 150
  (Note: If the uploaded sheet uses a 5-column x 20-item 100-item layout, a mobile screenshot, or a numbered answer sheet, read the item numbers accordingly).
- Each item row has 5 vertical rectangular bracket boxes from left to right: [A] [B] [C] [D] [E].
- Official PRC Marking Rules:
  * A single dark vertical bar or shaded fill inside [A], [B], [C], [D], or [E] counts as that letter choice.
  * If no bracket is shaded for an item, return "BLANK".
  * If two or more brackets are shaded for the same item, return "MULTIPLE_SHADED".
  * If an item has a heavy erasure, cross-out (X), slash (/), or horizontal dash (-), return "ERASURE_OR_INVALID_MARK".

Inspect the uploaded photo or scan carefully for items 1 up to ${Math.min(150, Math.max(totalExamItems, 130))} (and any shaded items up to 150 if over-shaded) and return the detected mark for each item number.`;

    const response = await generateWithFallback(
      ai,
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
          { text: visionPrompt },
        ],
      },
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedSet: {
              type: Type.STRING,
              description: 'Detected Test Question Set ("A", "B", or "UNSPECIFIED").',
            },
            detectedSubjectText: {
              type: Type.STRING,
              description: 'Subject title written in the SUBJECT box if visible.',
            },
            rows: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  itemNumber: { type: Type.INTEGER },
                  detectedAnswer: {
                    type: Type.STRING,
                    description: 'One of: "A", "B", "C", "D", "E", "BLANK", "MULTIPLE_SHADED", "ERASURE_OR_INVALID_MARK".',
                  },
                  confidenceNote: {
                    type: Type.STRING,
                    description: 'Brief note if multiple marks, smudge, or low lighting was observed.',
                  },
                },
                required: ['itemNumber', 'detectedAnswer'],
              },
            },
          },
          required: ['detectedSet', 'rows'],
        },
      }
    );

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText);
    res.json(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to scan PRC answer sheet photo.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  const portFlagIndex = process.argv.indexOf('--port');
  const cliPort =
    portFlagIndex !== -1 ? Number(process.argv[portFlagIndex + 1]) : NaN;
  const PORT =
    Number(process.env.PORT) ||
    (Number.isFinite(cliPort) && cliPort > 0 ? cliPort : 3000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      if (fs.existsSync(indexHtmlPath)) {
        res.sendFile(indexHtmlPath);
      } else {
        res.status(503).send('Application build not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BLEPPIFY server listening on http://localhost:${PORT}`);
    setTimeout(() => {
      const initialActivePdfs = hydratePdfStoreFromDisk();
      prewarmActivePdfsInBackground(initialActivePdfs);
    }, 1500);
  });
}

// Only bind a TCP port when running standalone (local dev / container), not inside Vercel Serverless Functions
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;

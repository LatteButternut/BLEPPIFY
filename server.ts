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

// ============================================================================
// AI provider selection: Groq (OpenAI-compatible API) or Gemini
//   - AI_PROVIDER=groq | gemini   (optional; default = groq when GROQ_API_KEY is set, else gemini)
//   - GROQ_API_KEY                (from https://console.groq.com/keys)
//   - GROQ_TEXT_MODELS / GROQ_VISION_MODELS  (optional comma-separated model IDs, tried in order)
//   - GROQ_PDF_CONTEXT_CHARS      (optional, max characters of PDF excerpts per request, default 7000)
//   - GROQ_MAX_CONCURRENCY        (optional, parallel Groq requests per server instance, default 2)
// ============================================================================
type AiProviderName = 'groq' | 'gemini';

interface AiClient {
  provider: AiProviderName;
  timeoutMs: number;
  gemini?: GoogleGenAI;
}

function getGroqApiKey(): string {
  return (process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_ || '').trim();
}

function getActiveProvider(): AiProviderName {
  const preferred = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (preferred === 'gemini') return 'gemini';
  if (preferred === 'groq') return 'groq';
  return getGroqApiKey() ? 'groq' : 'gemini';
}

function getAiClient(timeoutMs = 30000): AiClient {
  const provider = getActiveProvider();
  if (provider === 'groq') {
    if (!getGroqApiKey()) {
      throw new Error('Server GROQ_API_KEY is not configured.');
    }
    return { provider, timeoutMs };
  }
  return { provider, timeoutMs, gemini: getGeminiClient(timeoutMs) };
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

// ----------------------------------------------------------------------------
// PDF text extraction for Groq (Groq chat models cannot read PDF files directly)
// ----------------------------------------------------------------------------
const pdfTextCacheByHash = new Map<string, Promise<string>>();

async function extractPdfText(base64Data: string): Promise<string> {
  const hash = hashBase64(base64Data);
  const cached = pdfTextCacheByHash.get(hash);
  if (cached) return cached;

  const task = (async (): Promise<string> => {
    try {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const bytes = new Uint8Array(Buffer.from(base64Data, 'base64'));
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      const joined = Array.isArray(text) ? text.join('\n') : String(text || '');
      return joined.replace(/\s+/g, ' ').trim();
    } catch (err) {
      console.warn('[BLEPPIFY] PDF text extraction failed:', err instanceof Error ? err.message : err);
      return '';
    }
  })();

  pdfTextCacheByHash.set(hash, task);
  const text = await task;
  if (!text) pdfTextCacheByHash.delete(hash);
  return text;
}

const EXCERPT_STOPWORDS = new Set([
  'with', 'that', 'this', 'from', 'their', 'there', 'which', 'about', 'into', 'also', 'such', 'than',
  'then', 'them', 'these', 'those', 'have', 'been', 'were', 'will', 'would', 'should', 'could', 'items',
  'item', 'section', 'competency', 'competencies', 'bloom', 'remembering', 'understanding', 'applying',
  'analyzing', 'evaluating', 'creating', 'subject', 'scope', 'primary', 'spotlight', 'worker', 'allowed',
]);

/** Picks the PDF passages that best match the requested competencies so the prompt stays small. */
function selectPdfExcerpts(text: string, query: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxChars) return clean;

  const CHUNK_SIZE = 1100;
  const CHUNK_STEP = 900;
  const chunks: Array<{ idx: number; text: string; score: number }> = [];
  for (let i = 0, n = 0; i < clean.length; i += CHUNK_STEP, n++) {
    chunks.push({ idx: n, text: clean.slice(i, i + CHUNK_SIZE), score: 0 });
  }

  const terms = Array.from(
    new Set((query.toLowerCase().match(/[a-z][a-z-]{3,}/g) || []).filter((w) => !EXCERPT_STOPWORDS.has(w)))
  );
  if (terms.length > 0) {
    for (const chunk of chunks) {
      const lower = chunk.text.toLowerCase();
      let score = 0;
      for (const term of terms) {
        const first = lower.indexOf(term);
        if (first !== -1) {
          score += 1;
          if (lower.indexOf(term, first + term.length) !== -1) score += 0.5;
        }
      }
      chunk.score = score;
    }
  }

  const ranked = [...chunks].sort((a, b) => b.score - a.score || a.idx - b.idx);
  const picked: typeof chunks = [];
  let used = 0;
  for (const chunk of ranked) {
    if (used + chunk.text.length > maxChars) continue;
    picked.push(chunk);
    used += chunk.text.length;
    if (used >= maxChars - 200) break;
  }
  picked.sort((a, b) => a.idx - b.idx);
  return picked.map((c) => c.text).join('\n…\n');
}

async function resolvePdfParts(
  ai: AiClient,
  pdfFiles: Array<{ id?: string; name?: string; mimeType?: string; base64Data?: string }>,
  query = ''
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

  if (ai.provider === 'groq') {
    const budget = Math.max(1500, Number(process.env.GROQ_PDF_CONTEXT_CHARS) || 7000);
    const perPdfBudget = Math.floor(budget / Math.max(1, resolvedEntries.length));
    const excerpts: string[] = [];
    for (const entry of resolvedEntries) {
      const fullText = await extractPdfText(entry.base64Data);
      const excerpt = selectPdfExcerpts(fullText, query, perPdfBudget);
      if (excerpt) excerpts.push(excerpt);
    }
    if (excerpts.length === 0) {
      return { parts: [], missingIds: [] };
    }
    return {
      parts: [
        {
          text: `REFERENCE EXCERPTS FROM THE STUDENT'S UPLOADED PDF REVIEWER (only the most relevant passages are included; the full PDF is not attached):\n${excerpts.join('\n\n=== NEXT PDF ===\n')}\n--- END OF PDF EXCERPTS ---`,
        },
      ],
      missingIds: [],
    };
  }

  const geminiClient = ai.gemini as GoogleGenAI;
  const parts = await Promise.all(
    resolvedEntries.map(async (entry): Promise<PartInput> => {
      const handle = await getOrUploadGeminiPdfHandle(geminiClient, entry.mimeType, entry.base64Data);
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

// ----------------------------------------------------------------------------
// Groq helpers
// ----------------------------------------------------------------------------
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

function parseModelList(envValue: string | undefined, fallback: string[]): string[] {
  const list = (envValue || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return list.length > 0 ? list : fallback;
}

// Groq's free plan meters tokens per minute PER MODEL, so rotating across models also spreads the load.
function getGroqTextModels(): string[] {
  return parseModelList(process.env.GROQ_TEXT_MODELS, [
    'openai/gpt-oss-120b',
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-20b',
  ]);
}

function getGroqVisionModels(): string[] {
  return parseModelList(process.env.GROQ_VISION_MODELS, [
    'qwen/qwen3.8-27b',
    'qwen/qwen3.6-27b',
    'meta-models/muse-spark-open',
  ]);
}

function getGroqTemperature(): number {
  const raw = Number(process.env.GROQ_TEMPERATURE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 2 ? raw : 1.0;
}

function groqReasoningEffortFor(model: string, thorough = false): string | undefined {
  // Reasoning tokens count toward output/TPM, so keep them small on the free plan.
  // Set GROQ_QUESTION_REASONING=medium (or high) on a paid Groq plan for more accurate answer keys.
  // Only send the field to models that accept it.
  const override = (process.env.GROQ_QUESTION_REASONING || '').trim().toLowerCase();
  const validOverride = ['low', 'medium', 'high'].includes(override) ? override : '';
  if (model.startsWith('openai/gpt-oss')) return thorough && validOverride ? validOverride : 'low';
  if (model.startsWith('qwen/qwen3.8')) return thorough ? validOverride || 'low' : 'none';
  return undefined;
}

class GroqHttpError extends Error {
  status: number;
  retryAfterSec: number | null;
  constructor(message: string, status: number, retryAfterSec: number | null = null) {
    super(message);
    this.name = 'GroqHttpError';
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let groqActiveRequests = 0;
const groqWaiters: Array<() => void> = [];

async function withGroqSlot<T>(fn: () => Promise<T>): Promise<T> {
  const limit = Math.max(1, Number(process.env.GROQ_MAX_CONCURRENCY) || 2);
  if (groqActiveRequests >= limit) {
    // The slot is handed over directly by the request that finishes, so the counter stays accurate
    await new Promise<void>((resolve) => groqWaiters.push(resolve));
  } else {
    groqActiveRequests++;
  }
  try {
    return await fn();
  } finally {
    const next = groqWaiters.shift();
    if (next) {
      next();
    } else {
      groqActiveRequests--;
    }
  }
}

/**
 * Converts a Gemini-style response schema (Type.OBJECT / Type.ARRAY ...) into a strict JSON Schema for Groq:
 * lowercase types, additionalProperties:false, and every property listed as required
 * (optional properties become nullable, as Groq's strict mode requires).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStrictJsonSchema(node: any): any {
  if (!node || typeof node !== 'object') return node;
  const type = String(node.type || '').toLowerCase();
  const description = typeof node.description === 'string' ? node.description : undefined;

  if (type === 'object') {
    const props = (node.properties || {}) as Record<string, unknown>;
    const requiredSet = new Set<string>(Array.isArray(node.required) ? node.required : []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outProps: Record<string, any> = {};
    for (const [key, value] of Object.entries(props)) {
      let child = toStrictJsonSchema(value);
      if (!requiredSet.has(key)) {
        child =
          typeof child.type === 'string'
            ? { ...child, type: [child.type, 'null'] }
            : { anyOf: [child, { type: 'null' }] };
      }
      outProps[key] = child;
    }
    return {
      type: 'object',
      ...(description ? { description } : {}),
      properties: outProps,
      required: Object.keys(outProps),
      additionalProperties: false,
    };
  }

  if (type === 'array') {
    return {
      type: 'array',
      ...(description ? { description } : {}),
      items: toStrictJsonSchema(node.items),
    };
  }

  return {
    type: type || 'string',
    ...(description ? { description } : {}),
  };
}

async function callGroqChat(
  model: string,
  messages: unknown[],
  schema: Record<string, unknown>,
  maxTokens: number,
  timeoutMs: number,
  thorough = false
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: getGroqTemperature(),
    max_completion_tokens: maxTokens,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'bleppify_response', strict: true, schema },
    },
  };
  const effort = groqReasoningEffortFor(model, thorough);
  if (effort) body.reasoning_effort = effort;

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getGroqApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      detail = errJson?.error?.message || JSON.stringify(errJson);
    } catch {
      // ignore body parse errors
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new GroqHttpError(
      detail || `Groq API error ${res.status}`,
      res.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
  };
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new GroqHttpError('Groq returned an empty response.', 502);
  }
  if (choice?.finish_reason === 'length') {
    throw new GroqHttpError('Groq response was cut off before finishing (token limit).', 502);
  }
  return content;
}

async function generateWithGroq(
  contents: { parts: PartInput[] },
  config: Record<string, unknown>,
  timeoutMs: number,
  maxTokens: number,
  thorough = false
): Promise<{ text: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawSchema = config.responseSchema as any;
  if (!rawSchema) {
    throw new Error('Internal error: missing response schema for Groq request.');
  }

  const converted = toStrictJsonSchema(rawSchema);
  const rootIsArray = converted?.type === 'array';
  const schema: Record<string, unknown> = rootIsArray
    ? {
        type: 'object',
        properties: { items: converted },
        required: ['items'],
        additionalProperties: false,
      }
    : converted;

  const textChunks: string[] = [];
  const images: Array<{ mimeType: string; data: string }> = [];
  for (const part of contents.parts) {
    if ('text' in part) {
      textChunks.push(part.text);
    } else if ('inlineData' in part && part.inlineData.mimeType.startsWith('image/')) {
      images.push(part.inlineData);
    }
  }

  let promptText = textChunks.join('\n\n');
  if (rootIsArray) {
    promptText += '\n\nReturn a JSON object with a single key "items" whose value is the array described above.';
  }

  const userContent =
    images.length > 0
      ? [
          ...images.map((img) => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.data}` },
          })),
          { type: 'text', text: promptText },
        ]
      : promptText;

  const messages = [
    {
      role: 'system',
      content:
        'You are a precise assistant for Philippine BLEPP (Psychometrician board exam) review. Respond with JSON only, exactly matching the provided schema.',
    },
    { role: 'user', content: userContent },
  ];

  const models = images.length > 0 ? getGroqVisionModels() : getGroqTextModels();
  let lastError: unknown = null;

  for (let round = 0; round < 2; round++) {
    const now = Date.now();
    const active = models.filter((m) => (modelCooldownUntil.get(`groq:${m}`) || 0) <= now);
    const ordered = active.length > 0 ? active : models;
    let sawRateLimit = false;
    let shortestWaitSec: number | null = null;

    for (const model of ordered) {
      const cooldownKey = `groq:${model}`;
      try {
        const content = await withGroqSlot(() =>
          callGroqChat(model, messages, schema, maxTokens, timeoutMs, thorough)
        );
        modelCooldownUntil.delete(cooldownKey);
        if (!rootIsArray) {
          return { text: content };
        }
        const parsed = JSON.parse(content) as { items?: unknown };
        return { text: JSON.stringify(Array.isArray(parsed?.items) ? parsed.items : []) };
      } catch (err) {
        lastError = err;
        if (err instanceof GroqHttpError) {
          if (err.status === 401 || err.status === 403) {
            throw new Error('Groq rejected the API key. Check GROQ_API_KEY in your server environment variables.');
          }
          if (err.status === 429) {
            sawRateLimit = true;
            const waitSec = err.retryAfterSec ?? 20;
            shortestWaitSec = shortestWaitSec === null ? waitSec : Math.min(shortestWaitSec, waitSec);
            modelCooldownUntil.set(cooldownKey, Date.now() + waitSec * 1000);
          } else if (err.status === 413) {
            modelCooldownUntil.set(cooldownKey, Date.now() + 10_000);
          } else if (err.status === 400 && /failed to generate json/i.test(err.message)) {
            // The model produced malformed/truncated JSON: transient, so try the next model right away
            modelCooldownUntil.set(cooldownKey, Date.now() + 5_000);
          } else {
            modelCooldownUntil.set(cooldownKey, Date.now() + 2 * 60 * 1000);
          }
        } else {
          // network error or timeout
          modelCooldownUntil.set(cooldownKey, Date.now() + 30_000);
        }
      }
    }

    if (round === 0 && sawRateLimit && shortestWaitSec !== null && shortestWaitSec <= 20) {
      await sleep(shortestWaitSec * 1000 + 250);
      continue;
    }
    break;
  }

  if (lastError instanceof GroqHttpError && (lastError.status === 429 || lastError.status === 413)) {
    throw new Error(
      'Groq rate limit reached (the free plan allows roughly 8,000 tokens per minute per model). Please wait a minute and try again, or upgrade your Groq plan.'
    );
  }
  if (lastError instanceof GroqHttpError && /failed to generate json/i.test(lastError.message)) {
    throw new Error('The AI model returned malformed output for this batch. Please try again.');
  }
  throw lastError instanceof Error ? lastError : new Error('Groq request failed.');
}

async function generateWithFallback(
  ai: AiClient,
  contents: { parts: PartInput[] },
  config: Record<string, unknown>,
  preferLowThinkingLatency = false,
  opts: { maxTokens?: number; thorough?: boolean } = {}
): Promise<{ text?: string }> {
  if (ai.provider === 'groq') {
    return generateWithGroq(contents, config, ai.timeoutMs, opts.maxTokens ?? 4000, Boolean(opts.thorough));
  }
  const geminiClient = ai.gemini as GoogleGenAI;
  const candidates = preferLowThinkingLatency ? FAST_JSON_MODELS : VISION_MODELS;
  const now = Date.now();
  const activeCandidates = candidates.filter((m) => (modelCooldownUntil.get(m) || 0) <= now);
  const orderedModels = activeCandidates.length > 0 ? activeCandidates : candidates;

  let lastError: unknown = null;
  for (const model of orderedModels) {
    try {
      const res = await geminiClient.models.generateContent({
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

    const ai = getAiClient(45000);
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
          if (ai.provider === 'groq') {
            await extractPdfText(pdf.base64Data);
          } else {
            await getOrUploadGeminiPdfHandle(ai.gemini as GoogleGenAI, mimeType, pdf.base64Data);
          }
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
    const ai = getAiClient(30000);

    const { parts: pdfParts, missingIds } = await resolvePdfParts(
      ai,
      pdfFiles,
      `${sectionTitle || ''} ${competencyText || ''}`
    );
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
      true,
      { maxTokens: 1200 + safeCount * 220 }
    );

    const rawText = (response.text ?? '[]').trim();
    const cards = JSON.parse(rawText);
    res.json({ flashcards: cards });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate flashcards.';
    res.status(500).json({ error: message });
  }
});

// ----------------------------------------------------------------------------
// Question variety helpers
// ----------------------------------------------------------------------------
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

function optionTokenSet(options: Record<string, unknown> | undefined): Set<string> {
  const text = OPTION_LETTERS.map((l) => String(options?.[l] ?? '')).join(' ').toLowerCase();
  return new Set(text.match(/[a-z]{4,}/g) || []);
}

/** Drops items whose four options are almost the same words as an earlier item in the same batch. */
function dropNearIdenticalOptionSets(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const kept: Array<Record<string, unknown>> = [];
  const keptSets: Array<Set<string>> = [];
  const keptConcepts: Array<Set<string>> = [];
  for (const item of items) {
    const tokens = optionTokenSet(item.options as Record<string, unknown> | undefined);
    let duplicate = false;
    if (tokens.size >= 6) {
      for (const prev of keptSets) {
        let inter = 0;
        for (const t of tokens) if (prev.has(t)) inter++;
        const union = tokens.size + prev.size - inter;
        if (union > 0 && inter / union >= 0.6) {
          duplicate = true;
          break;
        }
      }
    }
    // Same specific concept written twice in one batch (even with different options) is also a repeat
    if (!duplicate && typeof item.focusConcept === 'string' && item.focusConcept.trim()) {
      const conceptTokens = new Set(
        item.focusConcept.toLowerCase().match(/[a-z]{4,}/g) || []
      );
      if (conceptTokens.size >= 3) {
        for (const prevConcept of keptConcepts) {
          let inter = 0;
          for (const t of conceptTokens) if (prevConcept.has(t)) inter++;
          const union = conceptTokens.size + prevConcept.size - inter;
          if (union > 0 && inter / union >= 0.7) {
            duplicate = true;
            break;
          }
        }
      }
    }
    if (!duplicate) {
      kept.push(item);
      keptSets.push(tokens);
      keptConcepts.push(
        new Set(String(item.focusConcept || '').toLowerCase().match(/[a-z]{4,}/g) || [])
      );
    }
  }
  return kept;
}

/** Randomizes option order (and remaps the key and rationales) so the keyed answer isn't always in the same slot. */
function shuffleQuestionOptions(item: Record<string, unknown>): Record<string, unknown> {
  const options = item.options as Record<string, string> | undefined;
  const key = String(item.correctChoice);
  if (!options || !OPTION_LETTERS.includes(key as (typeof OPTION_LETTERS)[number])) return item;

  const texts = OPTION_LETTERS.map((l) => String(options[l] ?? ''));
  const rationales = (item.optionRationales || {}) as Record<string, string>;
  const joined = [...texts, ...OPTION_LETTERS.map((l) => String(rationales[l] ?? ''))].join(' ');
  // Keep the original order when options depend on each other ("all of the above", "both A and B", "Option C", ...)
  if (/(all|none) of the (above|these)|\b(both|either)\s+[A-D]\b|\b(options?|choices?)\s+[A-D]\b/i.test(joined)) {
    return item;
  }

  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const newOptions: Record<string, string> = {};
  const newRationales: Record<string, string> = {};
  let newKey = key;
  order.forEach((oldIdx, newIdx) => {
    const newLetter = OPTION_LETTERS[newIdx];
    const oldLetter = OPTION_LETTERS[oldIdx];
    newOptions[newLetter] = texts[oldIdx];
    if (rationales[oldLetter] !== undefined) newRationales[newLetter] = rationales[oldLetter];
    if (oldLetter === key) newKey = newLetter;
  });

  return {
    ...item,
    options: newOptions,
    correctChoice: newKey,
    ...(item.optionRationales ? { optionRationales: newRationales } : {}),
  };
}

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
      excludeAnswers = [],
      excludeConcepts = [],
      compactMode = false,
      pdfFiles = [],
    } = req.body;

    const ai = getAiClient(35000);
    const { parts: pdfParts, missingIds } = await resolvePdfParts(
      ai,
      pdfFiles,
      `${scopeTitle || ''} ${lockedSectionTitle || ''} ${competencyDetails || ''} ${batchFocusHint || ''}`
    );
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

    const answerExclusionBlock =
      Array.isArray(excludeAnswers) && excludeAnswers.length > 0
        ? `\nCORRECT ANSWERS ALREADY USED IN EARLIER ITEMS (do NOT key any new item to these concepts again):\n${excludeAnswers
            .slice(0, 25)
            .map((a: unknown) => `- ${String(a).replace(/\s+/g, ' ').trim().slice(0, 110)}`)
            .join('\n')}\n`
        : '';

    const conceptExclusionBlock =
      Array.isArray(excludeConcepts) && excludeConcepts.length > 0
        ? `\nSPECIFIC CONCEPTS ALREADY TESTED (choose a different focusConcept for every new item):\n${excludeConcepts
            .slice(0, 30)
            .map((c: unknown) => `- ${String(c).replace(/\s+/g, ' ').trim().slice(0, 90)}`)
            .join('\n')}\n`
        : '';

    const bloomsDirective = `\nBLOOM'S LEVEL WRITING RULES (the bloomsLevel label must be TRUE to how the item is written — an item labeled with a higher level that only asks the student to spot a keyword is rejected):
- Remembering: ask for direct recall of a term, definition, name, criterion or fact. Short stem (1–2 lines), NO vignette. Options are terms or definitions. Easy.
- Understanding: ask the student to explain, classify, paraphrase, or pick the best example of a concept. Short stem, no long story. Easy.
- Applying: give a short case and require applying a named rule, criterion, technique or principle to reach a result. Moderate.
- Analyzing: require breaking a case or concept into parts, comparing or differentiating look-alike concepts, or identifying which cue/evidence supports which conclusion. Options are differences, relationships or evidence, not just labels. Difficult.
- Evaluating: require judging, justifying or critiquing a decision, interpretation, finding or approach against criteria (for example "which conclusion is best supported", "which approach is most defensible", "what is the flaw"). Difficult.
- Creating: require proposing, formulating or designing a plan, hypothesis, response or tool. Difficult.
- Items at different levels must LOOK different: vary stem length, format and the question verb. Do NOT write every item as the same "a person shows X; which factor indicates Y?" vignette.
- Follow the competency verbs in the TOS text above (Recognize/Identify = Remembering, Explain/Describe/Illustrate = Understanding, Apply/Employ = Applying, Analyze/Differentiate/Compare = Analyzing, Evaluate/Assess/Appraise = Evaluating, Formulate/Develop = Creating) and any level named in the sub-batch assignment.${conceptExclusionBlock}`;

    const varietyDirective = `\nITEM VARIETY RULES (CRITICAL — items that look like copies of each other are rejected):
- Every item must be keyed to a DIFFERENT concept. Never write two items whose correct answer says the same thing with only the character's name or age changed.
- Never reuse the same set of four options across items. Distractors must be written fresh for each stem, drawn from different related concepts in scope — not a fixed template such as "normal phase / abnormal behavior / cultural practice / temporary reaction".
- Vary the item format across the batch: some direct concept questions, some short vignettes, some "which of the following is NOT...", some comparisons. Vary the setting, age, gender, and Filipino context in vignettes.
- Spread the correct answer across A, B, C and D; do not favor any one letter.${answerExclusionBlock}`;

    const accuracyDirective = `\nACCURACY SELF-CHECK (do this silently for EVERY item before you finish it; a wrong key is the worst possible error):
- Re-read the stem and list every detail that rules options in or out. Example: if twins are "raised apart" in different environments, an explanation that depends on a shared rearing home (such as passive gene–environment correlation) cannot be the answer.
- Exactly ONE option may be defensible according to standard Philippine psychometrician review sources and mainstream textbooks. If two options could both be argued, rewrite the stem or the distractor.
- Write the rationales first, then set correctChoice to the option your rationales and examTip name as best. The rationale for the keyed option must say why it is right, and every other rationale must say why it is wrong for THIS stem.
- Do not key an option that needs an assumption the stem does not state.`;

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
${sectionLockDirective}${batchFocusDirective}${antiRepetitionDirective}${varietyDirective}${bloomsDirective}${accuracyDirective}
${difficultyInstruction}
${lengthDirective}
${groundingInstruction}

Generate exactly ${safeCount} multiple-choice board exam items.
For each item, fill the fields in this order:
0. focusConcept: a short phrase (max 12 words) naming the ONE specific sub-concept or skill this item tests. It must differ from every other item's focusConcept. Then choose bloomsLevel, then write the stem in the form that level requires.
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
              focusConcept: {
                type: Type.STRING,
                description: 'Max 12 words: the ONE specific sub-concept or skill this item tests. Different for every item.',
              },
              // bloomsLevel is chosen BEFORE the stem so the stem is written in that level's form
              bloomsLevel: {
                type: Type.STRING,
                description: 'Remembering, Understanding, Applying, Analyzing, Evaluating, or Creating. The stem must be written to genuinely require this level.',
              },
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
              sectionCode: {
                type: Type.STRING,
                description: 'Single uppercase letter: "A", "B", "C", "D", "E", or "F".',
              },
              tosCode: {
                type: Type.STRING,
                description: 'Specific TOS identifier.',
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
              // Keep correctChoice LAST: the model writes its reasoning (rationales + exam tip) first,
              // then commits to the key, which makes wrong keys less likely.
              correctChoice: {
                type: Type.STRING,
                description: '"A", "B", "C", or "D". Must be the option that your optionRationales and examTip identify as best.',
              },
            },
            required: [
              'focusConcept',
              'bloomsLevel',
              'stem',
              'options',
              'sectionCode',
              'tosCode',
              'optionRationales',
              'examTip',
              'correctChoice',
            ],
          },
        },
      },
      true,
      { maxTokens: compactMode ? 1200 + safeCount * 450 : 1600 + safeCount * 650, thorough: true }
    );

    const rawText = (response.text ?? '[]').trim();
    const parsedQuestions = JSON.parse(rawText);
    const variedQuestions = Array.isArray(parsedQuestions)
      ? dropNearIdenticalOptionSets(parsedQuestions as Array<Record<string, unknown>>).map(shuffleQuestionOptions)
      : [];
    const questions = Array.isArray(variedQuestions)
      ? variedQuestions.map((item: Record<string, unknown>) => {
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
    const message = error instanceof Error ? error.message : 'Failed to generate board exam items.';
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

    const ai = getAiClient(60000);

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
      },
      false,
      { maxTokens: 5000 }
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

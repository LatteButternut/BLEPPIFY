import React, { useState, useEffect, useRef } from 'react';
import {
  Trash2,
  Sparkles,
  CheckSquare,
  Square,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  Camera,
  Upload,
  Flag,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  Lightbulb,
  Lock,
  Save,
  BarChart3,
  ArrowLeft,
  X,
} from 'lucide-react';
import {
  BoardQuestionItem,
  FlashcardItem,
  getAdaptiveQuestionExamTip,
  getQuestionOptionRationales,
  OFFICIAL_PRC_TOS_PDF_PATH,
  SubjectConfig,
  TosCompetency,
  TosSection,
} from '../data/tosData';
import {
  buildMockExamSectionBatches,
  buildPracticeQuizParallelBatches,
  buildStrictSectionIsolationSpec,
  deduplicateFlashcards,
  deduplicateQuestions,
  evaluateQuizCompletionAndSectionGoals,
  computeMasteryStats,
  allocateAllScopeQuotas,
  COMPETENCY_MASTERY_THRESHOLD_PERCENT,
  COMPETENCY_MASTERY_MIN_ITEMS,
  COMPETENCY_MIN_ANSWERS_FOR_TIER,
  ExamAnswerKeyItem,
  filterPureLockedSectionQuestions,
  filterQuestionsStrictByScope,
  FLASHCARD_DECK_SIZE,
  formatExamTimer,
  getDifficultyFromBlooms,
  getSubjectMockExamSize,
  gradePrcAnswerSheet,
  MOCK_EXAM_DURATION_MINUTES,
  normalizeQuizItemCount,
  normalizeSectionLetter,
  PRACTICE_QUIZ_SIZE,
  QuestionAttemptLog,
  QUIZ_ITEM_COUNT_OPTIONS,
  ShadedChoice,
  SubjectSessionProgress,
} from '../utils/bleppLogic';
import { PrcAnswerSheet150 } from './PrcAnswerSheet150';
import { OmrScannerModal } from './OmrScannerModal';
import { PrintPacketModal } from './PrintPacketModal';

export interface UploadedPdfFile {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  base64Data: string;
  active: boolean;
}

interface SubjectWorkspaceProps {
  subject: SubjectConfig;
  onBackToHome?: () => void;
  studyMode: 'tos' | 'flashcards' | 'practice' | 'mock';
  onStudyModeChange: (mode: 'tos' | 'flashcards' | 'practice' | 'mock') => void;
  scopeRequest?: { scopeKey: string; nonce: number };
  sessionProgress: SubjectSessionProgress;
  onUpdateSessionProgress: (
    updater: (prev: SubjectSessionProgress) => SubjectSessionProgress
  ) => void;
  resumeTargetItemNumber?: number | null;
  resumeNonce?: number;
  masteredCompetencies: Record<string, boolean>;
  onToggleCompetency: (compId: string) => void;
  onMarkCompetenciesMastered: (compIds: string[]) => void;
  attemptLogs: QuestionAttemptLog[];
  onUnmarkCompetencies: (compIds: string[]) => void;
  onRemoveAttemptsForQuestions: (questionIds: string[]) => void;
  onSaveProgressNow: () => Promise<boolean>;
  onNavigateToAnalytics: () => void;
  seenStems: string[];
  onRecordSeenStems: (stems: string[]) => void;
  seenTerms: string[];
  onRecordSeenTerms: (terms: string[]) => void;
  pdfFiles: UploadedPdfFile[];
  onAddPdfFiles: (newFiles: UploadedPdfFile[]) => void;
  onTogglePdfActive: (pdfId: string) => void;
  onRemovePdfFile: (pdfId: string) => void;
  flashcards: FlashcardItem[];
  onUpdateFlashcards: (cards: FlashcardItem[]) => void;
  questions: BoardQuestionItem[];
  onUpdateQuestions: (
    updater:
      | BoardQuestionItem[]
      | ((prev: BoardQuestionItem[]) => BoardQuestionItem[])
  ) => void;
  onLoadOfficialTosBank: (mode?: 'flashcards' | 'practice' | 'mock') => void;
  onRecordMockScore: (percentage: number) => void;
  onRecordQuestionAttempts: (logs: QuestionAttemptLog[]) => void;
}

export const SubjectWorkspace: React.FC<SubjectWorkspaceProps> = ({
  subject,
  onBackToHome,
  studyMode,
  onStudyModeChange,
  scopeRequest,
  sessionProgress,
  onUpdateSessionProgress,
  resumeTargetItemNumber = null,
  resumeNonce = 0,
  masteredCompetencies,
  onToggleCompetency,
  onMarkCompetenciesMastered,
  attemptLogs,
  onUnmarkCompetencies,
  onRemoveAttemptsForQuestions,
  onSaveProgressNow,
  onNavigateToAnalytics,
  seenStems,
  onRecordSeenStems,
  seenTerms,
  onRecordSeenTerms,
  pdfFiles,
  onAddPdfFiles,
  onTogglePdfActive,
  onRemovePdfFile,
  flashcards,
  onUpdateFlashcards,
  questions,
  onUpdateQuestions,
  onLoadOfficialTosBank,
  onRecordMockScore,
  onRecordQuestionAttempts,
}) => {
  const setStudyMode = onStudyModeChange;

  const practiceScope = sessionProgress.practice.selectedScope || 'ALL';
  // Latest answers/selections, readable from inside long-running generation (the closure would be stale)
  const practiceInteractionRef = useRef<{
    submitted: Record<string, unknown>;
    draft: Record<string, unknown>;
  }>({ submitted: {}, draft: {} });
  practiceInteractionRef.current = {
    submitted: (sessionProgress.practice.submittedAnswers || {}) as Record<string, unknown>,
    draft: (sessionProgress.practice.draftChoices || {}) as Record<string, unknown>,
  };
  const selectedScope =
    studyMode === 'mock'
      ? sessionProgress.mock.selectedScope || 'ALL'
      : practiceScope;

  const setSelectedScope = (nextScope: string) => {
    onUpdateSessionProgress((prev) => ({
      ...prev,
      practice: {
        ...prev.practice,
        selectedScope: nextScope,
        // Clear activeQuestionIds if user manually switches scope filter in dropdown so matching questions in bank show cleanly
        activeQuestionIds:
          prev.practice.selectedScope === nextScope
            ? prev.practice.activeQuestionIds
            : undefined,
        completedAt: 0,
      },
    }));
  };

  const getQuizSizeForScope = (scopeKey: string): number => {
    if (scopeKey && scopeKey !== 'ALL') {
      const perSec = sessionProgress.practice.sectionItemCounts?.[scopeKey];
      if (perSec) {
        return normalizeQuizItemCount(perSec, PRACTICE_QUIZ_SIZE);
      }
    }
    return normalizeQuizItemCount(
      sessionProgress.practice.targetItemCount,
      PRACTICE_QUIZ_SIZE
    );
  };

  const setQuizSizeForScope = (scopeKey: string, nextCount: number) => {
    const normalized = normalizeQuizItemCount(nextCount, PRACTICE_QUIZ_SIZE);
    onUpdateSessionProgress((prev) => ({
      ...prev,
      practice: {
        ...prev.practice,
        targetItemCount:
          !scopeKey || scopeKey === 'ALL'
            ? normalized
            : prev.practice.targetItemCount ?? PRACTICE_QUIZ_SIZE,
        sectionItemCounts:
          scopeKey && scopeKey !== 'ALL'
            ? {
                ...(prev.practice.sectionItemCounts || {}),
                [scopeKey]: normalized,
              }
            : prev.practice.sectionItemCounts,
      },
    }));
  };

  const activeQuizSize = getQuizSizeForScope(practiceScope);

  const [difficultyFilter, setDifficultyFilter] = useState<string>('TOS_PROPORTIONAL');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState<boolean>(false);
  const [quizGeneratingTarget, setQuizGeneratingTarget] = useState<number>(PRACTICE_QUIZ_SIZE);
  const [quizStreamCount, setQuizStreamCount] = useState<number>(0);
  const [showAiGenerator, setShowAiGenerator] = useState<boolean>(false);
  const [genBanner, setGenBanner] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const syncedPdfIdsRef = useRef<Set<string>>(new Set());
  const quizRunNonceRef = useRef<number>(0);

  const inFlightTargetSize = isGeneratingQuiz ? quizGeneratingTarget : activeQuizSize;

  // Flashcard state (strictly 5 cards per active deck)
  const [fcIndex, setFcIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [fcFilter, setFcFilter] = useState<'all' | 'learning' | 'mastered'>('all');

  // Persisted Practice Quiz & Mock Exam state
  const draftPracticeChoices = sessionProgress.practice.draftChoices;
  const submittedPracticeAnswers = sessionProgress.practice.submittedAnswers;
  const mockViewLayout = sessionProgress.mock.mockViewLayout;
  const mockShadedMap = sessionProgress.mock.shadedMap;
  const flaggedItems = sessionProgress.mock.flaggedItems;
  const examineeName = sessionProgress.mock.examineeName;
  const questionSet = sessionProgress.mock.questionSet;
  const mockSubmitted = sessionProgress.mock.mockSubmitted;

  const setMockViewLayout = (layout: 'split' | 'full_prc_sheet') => {
    onUpdateSessionProgress((prev) => ({
      ...prev,
      mock: { ...prev.mock, mockViewLayout: layout },
    }));
  };

  const setExamineeName = (name: string) => {
    onUpdateSessionProgress((prev) => ({
      ...prev,
      mock: { ...prev.mock, examineeName: name },
    }));
  };

  const setQuestionSet = (qs: 'A' | 'B') => {
    onUpdateSessionProgress((prev) => ({
      ...prev,
      mock: { ...prev.mock, questionSet: qs },
    }));
  };

  // 3-Hour (180-Minute = 10,800 seconds) PRC Countdown Timer & Subject-Specific Mock Item Count (130 for Psych Assessment, 100 for others)
  const subjectMockSize =
    subject.totalBoardItems || getSubjectMockExamSize(subject.id);
  const fullMockSeconds = MOCK_EXAM_DURATION_MINUTES * 60;
  const [examSecondsLeft, setExamSecondsLeft] = useState<number>(
    sessionProgress.mock.examSecondsLeft || fullMockSeconds
  );
  const [isExamTimerRunning, setIsExamTimerRunning] = useState<boolean>(false);

  const examSecondsRef = useRef<number>(examSecondsLeft);
  examSecondsRef.current = examSecondsLeft;
  const wasTimerRunningRef = useRef<boolean>(false);
  wasTimerRunningRef.current = isExamTimerRunning;
  const updateSessionRef = useRef(onUpdateSessionProgress);
  updateSessionRef.current = onUpdateSessionProgress;

  // Modals for Printable PDF Packet & AI Photo OMR Scanner
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [printModalInitialTab, setPrintModalInitialTab] = useState<
    'questionnaire' | 'prc_sheet' | 'answer_key'
  >('prc_sheet');
  const [isOmrModalOpen, setIsOmrModalOpen] = useState<boolean>(false);
  const [pendingOmrPhotoFile, setPendingOmrPhotoFile] = useState<File | null>(null);
  const [isOfficialTosPdfOpen, setIsOfficialTosPdfOpen] = useState<boolean>(false);
  const [mobileMockTab, setMobileMockTab] = useState<'questions' | 'sheet'>('questions');

  // Sync subject-level transient UI without wiping saved Quiz or Mock answers
  useEffect(() => {
    setFcIndex(0);
    setIsFlipped(false);
    setIsExamTimerRunning(false);
    setMobileMockTab('questions');
    setGenBanner(null);
    setGenError(null);
    setSaveFeedback('idle');
    setSaveNotice(null);
  }, [subject.id]);

  // Keep local countdown display synced when switching subjects or resetting session
  useEffect(() => {
    if (!isExamTimerRunning) {
      setExamSecondsLeft(sessionProgress.mock.examSecondsLeft || fullMockSeconds);
    }
  }, [subject.id, fullMockSeconds, sessionProgress.mock.examSecondsLeft, isExamTimerRunning]);

  // Apply explicit external scope navigation ONLY when scopeRequest.nonce changes
  const lastAppliedScopeNonceRef = useRef<number>(0);
  useEffect(() => {
    if (!scopeRequest || !scopeRequest.nonce) return;
    if (lastAppliedScopeNonceRef.current === scopeRequest.nonce) return;
    lastAppliedScopeNonceRef.current = scopeRequest.nonce;

    updateSessionRef.current((prev) => ({
      ...prev,
      practice: {
        ...prev.practice,
        selectedScope: scopeRequest.scopeKey,
        activeQuestionIds:
          prev.practice.selectedScope === scopeRequest.scopeKey
            ? prev.practice.activeQuestionIds
            : undefined,
      },
    }));

    if (studyMode === 'tos') {
      const targetKey = scopeRequest.scopeKey;
      const secIndex = subject.sections.findIndex((s) => s.id === targetKey);
      window.requestAnimationFrame(() => {
        if (!targetKey || targetKey === 'ALL' || secIndex <= 0) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        const el = document.getElementById(`tos-section-${targetKey}`);
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - 84;
          window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
      });
    }
  }, [scopeRequest, studyMode, subject.sections]);

  // Save running timer seconds if user exits Mock mode or switches away to another tab
  useEffect(() => {
    return () => {
      if (wasTimerRunningRef.current) {
        updateSessionRef.current((prev) => ({
          ...prev,
          mock: {
            ...prev.mock,
            examSecondsLeft: examSecondsRef.current,
            updatedAt: Date.now(),
          },
        }));
      }
    };
  }, [subject.id, studyMode]);

  useEffect(() => {
    if (!isExamTimerRunning || mockSubmitted) return;
    const timer = window.setInterval(() => {
      setExamSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsExamTimerRunning(false);
          updateSessionRef.current((curr) => ({
            ...curr,
            mock: {
              ...curr.mock,
              examSecondsLeft: 0,
              mockSubmitted: true,
              updatedAt: Date.now(),
            },
          }));
          return 0;
        }
        const next = prev - 1;
        if (next % 10 === 0) {
          updateSessionRef.current((curr) => ({
            ...curr,
            mock: {
              ...curr.mock,
              examSecondsLeft: next,
              updatedAt: Date.now(),
            },
          }));
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isExamTimerRunning, mockSubmitted]);

  // Smoothly scroll to the resumed question item when clicking Continue Quiz / Continue Mock
  useEffect(() => {
    if (!resumeNonce || !resumeTargetItemNumber) return;
    const targetId =
      studyMode === 'mock'
        ? `mock-item-${resumeTargetItemNumber}`
        : `quiz-item-${resumeTargetItemNumber}`;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [resumeNonce, resumeTargetItemNumber, studyMode, subject.id]);

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    Array.from(fileList).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const resultStr = String(reader.result || '');
        const base64Data = resultStr.split(',')[1] || '';
        onAddPdfFiles([
          {
            id: `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: file.name,
            sizeBytes: file.size,
            mimeType: file.type || 'application/pdf',
            base64Data,
            active: true,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const activePdfs = pdfFiles.filter((p) => p.active);

  // Syncs active PDFs once to the server-side Gemini File cache so parallel sub-batches send 150-byte IDs instead of multi-MB base64 payloads
  const preparePdfRefsForApi = async (): Promise<
    Array<{ id: string; name: string; mimeType: string; base64Data?: string }>
  > => {
    if (activePdfs.length === 0) return [];

    const uncheckedIds = activePdfs
      .filter((p) => !syncedPdfIdsRef.current.has(p.id))
      .map((p) => p.id);

    if (uncheckedIds.length > 0) {
      try {
        const checkRes = await fetch('/api/gemini/register-pdfs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkIds: uncheckedIds }),
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const missingSet = new Set<string>(
            Array.isArray(checkData.missingIds) ? checkData.missingIds : uncheckedIds
          );
          const toUpload = activePdfs.filter((p) => missingSet.has(p.id));
          if (toUpload.length > 0) {
            const upRes = await fetch('/api/gemini/register-pdfs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pdfFiles: toUpload.map((p) => ({
                  id: p.id,
                  name: p.name,
                  mimeType: p.mimeType,
                  base64Data: p.base64Data,
                })),
              }),
            });
            if (upRes.ok) {
              activePdfs.forEach((p) => syncedPdfIdsRef.current.add(p.id));
            } else {
              return activePdfs.map((p) => ({
                id: p.id,
                name: p.name,
                mimeType: p.mimeType,
                base64Data: p.base64Data,
              }));
            }
          } else {
            activePdfs.forEach((p) => syncedPdfIdsRef.current.add(p.id));
          }
        }
      } catch {
        return activePdfs.map((p) => ({
          id: p.id,
          name: p.name,
          mimeType: p.mimeType,
          base64Data: p.base64Data,
        }));
      }
    }

    return activePdfs.map((p) => ({
      id: p.id,
      name: p.name,
      mimeType: p.mimeType,
    }));
  };

  // Wrapper that transparently retries once with full base64Data if the server restarted and evicted its PDF cache
  const postGeminiJsonWithPdfRetry = async (
    endpoint: string,
    payload: Record<string, unknown>,
    pdfRefs: Array<{ id: string; name: string; mimeType: string; base64Data?: string }>
  ): Promise<Response> => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, pdfFiles: pdfRefs }),
    });
    if (res.status === 409 && activePdfs.length > 0) {
      syncedPdfIdsRef.current.clear();
      const fullPdfs = activePdfs.map((p) => ({
        id: p.id,
        name: p.name,
        mimeType: p.mimeType,
        base64Data: p.base64Data,
      }));
      const retryRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, pdfFiles: fullPdfs }),
      });
      if (retryRes.ok) {
        activePdfs.forEach((p) => syncedPdfIdsRef.current.add(p.id));
      }
      return retryRes;
    }
    return res;
  };

  const resolveScopeDescription = (
    scopeKey: string
  ): {
    title: string;
    details: string;
    lockedSectionLetter?: string;
    lockedSectionTitle?: string;
  } => {
    if (scopeKey === 'ALL') {
      const allDetails = subject.sections
        .map(
          (s) =>
            `Section ${s.sectionLetter}. ${s.title} (${s.weightPercent}%, ${s.itemCount} items): ` +
            s.competencies.map((c) => `[${c.code}] ${c.description} (${c.bloomsBreakdown})`).join('; ')
        )
        .join('\n');
      return {
        title: `Full Subject (${subject.fullTitle})`,
        details: allDetails,
      };
    }

    const foundSec = subject.sections.find((s) => s.id === scopeKey);
    if (foundSec) {
      return {
        title: `Section ${foundSec.sectionLetter}: ${foundSec.title} (${foundSec.weightPercent}%)`,
        details: foundSec.competencies
          .map((c) => `[${c.code}] ${c.description} (${c.bloomsBreakdown})`)
          .join('\n'),
        lockedSectionLetter: foundSec.sectionLetter,
        lockedSectionTitle: foundSec.title,
      };
    }

    for (const sec of subject.sections) {
      const comp = sec.competencies.find((c) => c.id === scopeKey);
      if (comp) {
        return {
          title: `Section ${sec.sectionLetter} · ${comp.code}: ${comp.description}`,
          details: `${comp.description} (${comp.itemCount} items — ${comp.bloomsBreakdown})`,
          lockedSectionLetter: sec.sectionLetter,
          lockedSectionTitle: sec.title,
        };
      }
    }

    return { title: subject.fullTitle, details: subject.bloomsDistributionSummary };
  };

  // Helper to map raw server question JSON into clean BoardQuestionItem objects
  const mapRawQuestion = (
    q: Record<string, any>,
    idx: number,
    fallbackTitle: string,
    forcedSectionLetter?: string
  ): BoardQuestionItem => {
    const cleanSection = forcedSectionLetter
      ? forcedSectionLetter.trim().toUpperCase()
      : normalizeSectionLetter(String(q.sectionCode || 'A'), 'A');
    const correctChoice = (['A', 'B', 'C', 'D'].includes(q.correctChoice)
      ? q.correctChoice
      : 'A') as 'A' | 'B' | 'C' | 'D';
    const optRationales = q.optionRationales
      ? {
          A: String(q.optionRationales.A || '').trim(),
          B: String(q.optionRationales.B || '').trim(),
          C: String(q.optionRationales.C || '').trim(),
          D: String(q.optionRationales.D || '').trim(),
        }
      : undefined;

    return {
      id: `q_gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${idx}`,
      stem: String(q.stem || '').trim(),
      options: {
        A: q.options?.A || 'Option A',
        B: q.options?.B || 'Option B',
        C: q.options?.C || 'Option C',
        D: q.options?.D || 'Option D',
      },
      correctChoice,
      sectionCode: cleanSection,
      tosCode: q.tosCode || fallbackTitle,
      bloomsLevel: q.bloomsLevel || 'Applying',
      rationale:
        (typeof q.rationale === 'string' && q.rationale.trim()) ||
        optRationales?.[correctChoice] ||
        (typeof q.examTip === 'string' && q.examTip.trim()) ||
        'Aligned with PRC Annex B TOS.',
      optionRationales: optRationales,
      examTip: q.examTip ? String(q.examTip).trim() : undefined,
      focusConcept: typeof q.focusConcept === 'string' && q.focusConcept.trim() ? q.focusConcept.trim() : undefined,
      adaptiveTips: q.adaptiveTips
        ? {
            correctTip: q.adaptiveTips.correctTip || undefined,
            misconceptionTips: q.adaptiveTips.misconceptionTips || undefined,
          }
        : undefined,
    };
  };

  // 1. Generate 5 Fresh, Non-Repetitive Flashcards
  const handleGenerateFlashcards = async (customScopeKey?: string) => {
    const targetScope = customScopeKey || selectedScope;
    const { title, details } = resolveScopeDescription(targetScope);
    const isolationSpec = buildStrictSectionIsolationSpec(
      subject.id,
      subject.sections,
      targetScope
    );
    setIsGenerating(true);
    setGenError(null);
    setGenBanner(`Generating ${FLASHCARD_DECK_SIZE} fresh flashcards for ${title}...`);

    try {
      const priorTerms = Array.from(
        new Set([
          ...seenTerms,
          ...flashcards.map((c) => c.term),
          ...subject.seedFlashcards.map((c) => c.term),
        ])
      );

      const pdfRefs = await preparePdfRefsForApi();
      const response = await postGeminiJsonWithPdfRetry(
        '/api/gemini/flashcards',
        {
          subjectTitle: subject.fullTitle,
          sectionTitle: title,
          competencyText: details,
          lockedSectionLetter: isolationSpec.lockedSectionLetter || '',
          lockedSectionTitle: isolationSpec.lockedSectionTitle || '',
          excludedSectionsDetails: isolationSpec.excludedSiblingSectionsText || '',
          domainBoundaryNote: isolationSpec.domainBoundaryNote || '',
          count: priorTerms.length > 0 ? FLASHCARD_DECK_SIZE + 2 : FLASHCARD_DECK_SIZE,
          excludeTerms: priorTerms,
        },
        pdfRefs
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate flashcards.');
      }

      const data = await response.json();
      if (Array.isArray(data.flashcards) && data.flashcards.length > 0) {
        const mappedAll: FlashcardItem[] = data.flashcards.map(
          (c: { term: string; definition: string; tosCode: string; bloomsLevel: any }, i: number) => ({
            id: `fc_gen_${Date.now()}_${i}`,
            term: c.term,
            definition: c.definition,
            tosCode: c.tosCode || title,
            bloomsLevel: c.bloomsLevel || 'Applying',
            status: 'unseen',
          })
        );
        const deduped = deduplicateFlashcards(mappedAll, priorTerms);
        const finalDeck = (deduped.length >= FLASHCARD_DECK_SIZE ? deduped : mappedAll).slice(
          0,
          FLASHCARD_DECK_SIZE
        );

        onRecordSeenTerms(finalDeck.map((c) => c.term));
        onUpdateFlashcards(finalDeck);
        setFcIndex(0);
        setIsFlipped(false);
        setStudyMode('flashcards');
        setGenBanner(
          `Generated ${finalDeck.length} fresh flashcards${
            isolationSpec.lockedSectionLetter
              ? ` strictly for Section ${isolationSpec.lockedSectionLetter}: ${isolationSpec.lockedSectionTitle}`
              : activePdfs.length > 0
              ? ` grounded in ${activePdfs.length} PDF(s)`
              : ` for ${title}`
          }.`
        );
      }
    } catch (err: unknown) {
      setGenError(
        err instanceof Error ? err.message : 'Unable to generate flashcards right now.'
      );
      setGenBanner(null);
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Generate Configurable (5–50 Item, Default 15) Practice / Section Quiz (Parallel Sub-Batches + Strict Section Isolation)
  const handleGeneratePracticeQuiz = async (
    customScopeKey?: string,
    customItemCount?: number,
    options: { appendToCurrent?: boolean } = {}
  ) => {
    // appendToCurrent: keep the questions (and answers) already in the quiz and only generate the missing ones
    const appendMode = Boolean(options.appendToCurrent);
    const existingQuizItems: BoardQuestionItem[] = appendMode ? [...practiceDisplayedQuestions] : [];
    const targetScope = customScopeKey || practiceScope || 'ALL';
    const targetQuizSize = normalizeQuizItemCount(
      customItemCount ?? getQuizSizeForScope(targetScope),
      PRACTICE_QUIZ_SIZE
    );
    const { title, details, lockedSectionLetter, lockedSectionTitle } =
      resolveScopeDescription(targetScope);
    const isolationSpec = buildStrictSectionIsolationSpec(
      subject.id,
      subject.sections,
      targetScope
    );
    const isAllScope = targetScope === 'ALL';

    // Full-Subject quizzes are split across sections by official TOS weight (and by what you have practiced
    // least), then every section is generated with its own strict section lock.
    type QuizJobCtx = {
      title: string;
      lockedSectionLetter?: string;
      lockedSectionTitle?: string;
      excludedSiblingSectionsText: string;
      domainBoundaryNote: string;
    };
    const mainCtx: QuizJobCtx = {
      title,
      lockedSectionLetter,
      lockedSectionTitle,
      excludedSiblingSectionsText: isolationSpec.excludedSiblingSectionsText || '',
      domainBoundaryNote: isolationSpec.domainBoundaryNote || '',
    };
    const answeredBySection: Record<string, number> = {};
    for (const sec of subject.sections) {
      answeredBySection[sec.id] = masteryStats.bySection[sec.id]?.attempts || 0;
    }
    const allScopeQuotas: Record<string, number> = isAllScope
      ? allocateAllScopeQuotas(subject.sections, targetQuizSize, answeredBySection)
      : {};
    const sectionCtxFor = (sec: (typeof subject.sections)[number]): QuizJobCtx => {
      const desc = resolveScopeDescription(sec.id);
      const iso = buildStrictSectionIsolationSpec(subject.id, subject.sections, sec.id);
      return {
        title: desc.title,
        lockedSectionLetter: desc.lockedSectionLetter,
        lockedSectionTitle: desc.lockedSectionTitle,
        excludedSiblingSectionsText: iso.excludedSiblingSectionsText || '',
        domainBoundaryNote: iso.domainBoundaryNote || '',
      };
    };
    // Competency lines for a section, least-practiced goals first, so new items fill the gaps in your mastery
    const competencyLinesFor = (sec: (typeof subject.sections)[number], take: number): string => {
      const ranked = [...sec.competencies].sort(
        (a, b) =>
          (masteryStats.byCompetency[a.id]?.attempts || 0) -
            (masteryStats.byCompetency[b.id]?.attempts || 0) || b.itemCount - a.itemCount
      );
      return ranked
        .slice(0, Math.max(1, take))
        .map((c) => `[${c.code}] ${c.description} (${c.bloomsBreakdown})`)
        .join('\n');
    };

    const currentRunNonce = ++quizRunNonceRef.current;
    setIsGenerating(true);
    setIsGeneratingQuiz(true);
    setQuizGeneratingTarget(targetQuizSize);
    setQuizStreamCount(appendMode ? existingQuizItems.length : 0);
    setGenError(null);
    setSaveFeedback('idle');
    setSaveNotice(null);
    setStudyMode('practice');

    onUpdateSessionProgress((prev) => ({
      ...prev,
      practice: {
        ...prev.practice,
        selectedScope: targetScope,
        targetItemCount:
          targetScope === 'ALL'
            ? targetQuizSize
            : prev.practice.targetItemCount ?? PRACTICE_QUIZ_SIZE,
        sectionItemCounts:
          targetScope !== 'ALL'
            ? {
                ...(prev.practice.sectionItemCounts || {}),
                [targetScope]: targetQuizSize,
              }
            : prev.practice.sectionItemCounts,
      },
    }));

    setGenBanner(
      appendMode
        ? `Generating the remaining ${Math.max(0, targetQuizSize - existingQuizItems.length)} quiz items — your current questions and answers are kept...`
        : isAllScope
        ? `Generating ${targetQuizSize}-item Full Subject Quiz — items are distributed across all sections by official TOS weight...`
        : `Generating ${targetQuizSize}-item ${
        lockedSectionLetter
          ? `Section ${lockedSectionLetter} (${lockedSectionTitle}) `
          : ''
      }Quiz in parallel — strictly isolated to this scope...`
    );

    try {
      const priorStems = Array.from(
        new Set([
          ...seenStems,
          ...questions.map((q) => q.stem),
          ...subject.seedQuestions.map((q) => q.stem),
        ])
      );

      const pdfRefs = await preparePdfRefsForApi();
      type QuizJob = {
        ctx: QuizJobCtx;
        batch: {
          batchIndex: number;
          count: number;
          competencySubsetText: string;
          batchFocusHint?: string;
        };
      };

      let jobs: QuizJob[] = [];
      if (!isAllScope) {
        if (!appendMode) {
          jobs = buildPracticeQuizParallelBatches(
            details,
            difficultyFilter,
            targetQuizSize,
            lockedSectionLetter
              ? {
                  subjectId: subject.id,
                  sectionLetter: lockedSectionLetter,
                  sectionTitle: lockedSectionTitle || title,
                }
              : undefined
          ).map((batch) => ({ ctx: mainCtx, batch }));
        }
      } else {
        // How many items each section still needs (existing items count when topping up an existing quiz)
        const existingBySection: Record<string, number> = {};
        for (const q of existingQuizItems) {
          const letter = String(q.sectionCode || '').trim().toUpperCase();
          existingBySection[letter] = (existingBySection[letter] || 0) + 1;
        }
        const need: Record<string, number> = {};
        let needTotal = 0;
        for (const sec of subject.sections) {
          const have = existingBySection[sec.sectionLetter.trim().toUpperCase()] || 0;
          need[sec.id] = Math.max(0, (allScopeQuotas[sec.id] || 0) - have);
          needTotal += need[sec.id];
        }
        const missingTotal = targetQuizSize - existingQuizItems.length;
        while (needTotal < missingTotal && subject.sections.length > 0) {
          const next = [...subject.sections].sort(
            (x, y) =>
              (allScopeQuotas[y.id] || 0) - (existingBySection[y.sectionLetter.toUpperCase()] || 0) -
                need[y.id] -
                ((allScopeQuotas[x.id] || 0) - (existingBySection[x.sectionLetter.toUpperCase()] || 0) - need[x.id])
          )[0];
          need[next.id] += 1;
          needTotal += 1;
        }

        let batchIndex = 1;
        const perSectionJobs: QuizJob[][] = [];
        for (const sec of subject.sections) {
          const qty = need[sec.id] || 0;
          if (qty <= 0) continue;
          const ctx = sectionCtxFor(sec);
          const chunkCount = Math.ceil(qty / 6);
          const secJobs: QuizJob[] = [];
          let remaining = qty;
          for (let i = 0; i < chunkCount; i++) {
            const size = Math.ceil(remaining / (chunkCount - i));
            remaining -= size;
            secJobs.push({
              ctx,
              batch: {
                batchIndex: batchIndex++,
                count: size,
                competencySubsetText: competencyLinesFor(sec, Math.max(size, 2)),
                batchFocusHint: `Full Subject quiz: write exactly ${size} item(s) for Section ${sec.sectionLetter} only. Put each item on a DIFFERENT competency from the list (one item per listed competency when possible) and follow the Bloom's level named in each competency.`,
              },
            });
          }
          perSectionJobs.push(secJobs);
        }
        // Interleave sections so the first results already cover several sections
        const longest = Math.max(0, ...perSectionJobs.map((list) => list.length));
        for (let i = 0; i < longest; i++) {
          for (const list of perSectionJobs) if (list[i]) jobs.push(list[i]);
        }
      }

      const acceptedItems: BoardQuestionItem[] = appendMode ? [...existingQuizItems] : [];

      // Full Subject quizzes are truly shuffled: every new item goes to a random position among the items you
      // have not touched yet. Items you already answered or selected never move. (Section quizzes keep their
      // easy-to-hard order and "Generate more" simply appends.)
      const addAcceptedItems = (items: BoardQuestionItem[]) => {
        if (!isAllScope) {
          acceptedItems.push(...items);
          return;
        }
        const { submitted, draft } = practiceInteractionRef.current;
        let lastTouched = -1;
        acceptedItems.forEach((q, i) => {
          if (submitted[q.id] || draft[q.id]) lastTouched = i;
        });
        const firstMovable = lastTouched + 1;
        for (const item of items) {
          const span = acceptedItems.length - firstMovable + 1;
          const at = firstMovable + Math.floor(Math.random() * span);
          acceptedItems.splice(at, 0, item);
        }
      };
      const fallbackPureMapped: BoardQuestionItem[] = [];
      const runningExcludedStems = [...priorStems];
      let hasCommittedFirstWave = appendMode;
      const batchErrors: string[] = [];

      const commitProgressiveWave = (waveItems: BoardQuestionItem[]) => {
        if (quizRunNonceRef.current !== currentRunNonce) return;
        const currentIds = waveItems.map((q) => q.id);
        const isFirstWave = !hasCommittedFirstWave;
        hasCommittedFirstWave = true;

        setQuizStreamCount(waveItems.length);

        onUpdateQuestions((prevQs) => {
          const mockIdSet = new Set(sessionProgress.mock.activeQuestionIds || []);
          const retainedMockQs = prevQs.filter((q) => mockIdSet.has(q.id));
          return [...waveItems, ...retainedMockQs];
        });

        onUpdateSessionProgress((prev) => ({
          ...prev,
          practice: {
            ...prev.practice,
            // Reset answers ONLY when the very first batch of the new quiz arrives; preserve any answers clicked while remaining batches finish!
            draftChoices: isFirstWave ? {} : prev.practice.draftChoices,
            submittedAnswers: isFirstWave ? {} : prev.practice.submittedAnswers,
            selectedScope: targetScope,
            activeQuestionIds: currentIds,
            completedAt: 0,
            updatedAt: isFirstWave ? 0 : prev.practice.updatedAt,
          },
        }));

        if (waveItems.length < targetQuizSize) {
          setGenBanner(
            `${waveItems.length} of ${targetQuizSize} ${
              lockedSectionLetter ? `Section ${lockedSectionLetter} ` : ''
            }quiz items ready — start answering Item #1 while remaining items finish...`
          );
        }
      };

      const mapAndVerifyPureBatch = (
        rawItems: any[],
        offsetBase: number,
        jobCtx: QuizJobCtx = mainCtx
      ): BoardQuestionItem[] => {
        const jobLockedLetter = jobCtx.lockedSectionLetter;
        // Preserve honest model sectionCode first so off-section items can be detected before locking
        const prelimMapped = rawItems.map((q: any, idx: number) =>
          mapRawQuestion(
            {
              ...q,
              sectionCode:
                typeof q?.sectionCode === 'string' && q.sectionCode.trim()
                  ? q.sectionCode
                  : jobLockedLetter || 'A',
            },
            offsetBase + idx,
            jobCtx.title
          )
        );

        const pureOnly = filterPureLockedSectionQuestions(
          prelimMapped,
          subject.id,
          jobLockedLetter
        );

        return jobLockedLetter
          ? pureOnly.map((item) => ({
              ...item,
              sectionCode: jobLockedLetter.trim().toUpperCase(),
            }))
          : pureOnly;
      };

      // Sliding 4-worker concurrency pool so 15-item quizzes run all 4 workers simultaneously
      // while 30–50 item Section Quizzes stream smoothly without timeouts or rate-limit spikes
      const CONCURRENCY_LIMIT = 4;
      let nextSubBatchCursor = 0;

      const runSubBatchWorker = async () => {
        while (nextSubBatchCursor < jobs.length) {
          if (
            quizRunNonceRef.current !== currentRunNonce ||
            acceptedItems.length >= targetQuizSize
          ) {
            return;
          }
          const job = jobs[nextSubBatchCursor++];
          const subBatch = job.batch;
          const jobCtx = job.ctx;
          try {
            const res = await postGeminiJsonWithPdfRetry(
              '/api/gemini/questions',
              {
                subjectTitle: subject.fullTitle,
                scopeTitle: jobCtx.title,
                competencyDetails: subBatch.competencySubsetText,
                count: subBatch.count,
                difficultyFilter,
                lockedSectionLetter: jobCtx.lockedSectionLetter,
                lockedSectionTitle: jobCtx.lockedSectionTitle,
                excludedSectionsDetails: jobCtx.excludedSiblingSectionsText,
                domainBoundaryNote: jobCtx.domainBoundaryNote,
                batchFocusHint: subBatch.batchFocusHint,
                excludeStems: runningExcludedStems.slice(-25),
                excludeAnswers: acceptedItems
                  .map((q) => q.options?.[q.correctChoice] || '')
                  .filter(Boolean)
                  .slice(-25),
                excludeConcepts: acceptedItems
                  .map((q) => q.focusConcept || '')
                  .filter(Boolean)
                  .slice(-30),
                compactMode: false,
              },
              pdfRefs
            );

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              batchErrors.push(err.error || `Batch ${subBatch.batchIndex} failed.`);
              continue;
            }

            const data = await res.json();
            const rawItems = Array.isArray(data.questions) ? data.questions : [];
            const pureSub = mapAndVerifyPureBatch(rawItems, subBatch.batchIndex * 20, jobCtx);

            fallbackPureMapped.push(...pureSub);
            const uniqueSub = deduplicateQuestions(
              pureSub,
              runningExcludedStems,
              acceptedItems,
              `${jobCtx.title} ${subBatch.competencySubsetText}`
            );

            if (uniqueSub.length > 0 && acceptedItems.length < targetQuizSize) {
              const slotsLeft = targetQuizSize - acceptedItems.length;
              const toAdd = uniqueSub.slice(0, slotsLeft);
              addAcceptedItems(toAdd);
              for (const item of toAdd) {
                runningExcludedStems.push(item.stem);
              }
              commitProgressiveWave([...acceptedItems]);
            }
          } catch (e: unknown) {
            batchErrors.push(e instanceof Error ? e.message : 'Sub-batch request failed.');
          }
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENCY_LIMIT, jobs.length) },
          () => runSubBatchWorker()
        )
      );

      // Fast bounded top-up waves (<= 10 items per call) if strict section purity or deduplication left fewer than targetQuizSize
      for (
        let topUpAttempt = 0;
        topUpAttempt < (appendMode ? 4 : 2) &&
        acceptedItems.length < targetQuizSize &&
        quizRunNonceRef.current === currentRunNonce;
        topUpAttempt++
      ) {
        const needed = targetQuizSize - acceptedItems.length;
        let topUpCtx: QuizJobCtx = mainCtx;
        let topUpDetails = details;
        let topUpCount = Math.min(appendMode ? 8 : 10, needed + 2);
        if (isAllScope) {
          const haveBySection: Record<string, number> = {};
          for (const q of acceptedItems) {
            const letter = String(q.sectionCode || '').trim().toUpperCase();
            haveBySection[letter] = (haveBySection[letter] || 0) + 1;
          }
          const neediest = [...subject.sections].sort(
            (x, y) =>
              (allScopeQuotas[y.id] || 0) - (haveBySection[y.sectionLetter.toUpperCase()] || 0) -
              ((allScopeQuotas[x.id] || 0) - (haveBySection[x.sectionLetter.toUpperCase()] || 0))
          )[0];
          if (neediest) {
            const gap = Math.max(
              1,
              (allScopeQuotas[neediest.id] || 0) - (haveBySection[neediest.sectionLetter.toUpperCase()] || 0)
            );
            topUpCtx = sectionCtxFor(neediest);
            topUpDetails = competencyLinesFor(neediest, Math.max(gap, 2));
            topUpCount = Math.min(6, gap + 1);
          }
        }
        const topUpRes = await postGeminiJsonWithPdfRetry(
          '/api/gemini/questions',
          {
            subjectTitle: subject.fullTitle,
            scopeTitle: topUpCtx.title,
            competencyDetails: topUpDetails,
            count: topUpCount,
            difficultyFilter,
            lockedSectionLetter: topUpCtx.lockedSectionLetter,
            lockedSectionTitle: topUpCtx.lockedSectionTitle,
            excludedSectionsDetails: topUpCtx.excludedSiblingSectionsText,
            domainBoundaryNote: topUpCtx.domainBoundaryNote,
            excludeStems: runningExcludedStems.slice(-25),
            excludeAnswers: acceptedItems
              .map((q) => q.options?.[q.correctChoice] || '')
              .filter(Boolean)
              .slice(-25),
            excludeConcepts: acceptedItems
              .map((q) => q.focusConcept || '')
              .filter(Boolean)
              .slice(-30),
            compactMode: false,
          },
          pdfRefs
        );
        if (!topUpRes.ok) break;
        const topUpData = await topUpRes.json();
        if (Array.isArray(topUpData.questions)) {
          const topUpPure = mapAndVerifyPureBatch(
            topUpData.questions,
            500 + topUpAttempt * 50,
            topUpCtx
          );
          fallbackPureMapped.push(...topUpPure);
          const extraUnique = deduplicateQuestions(
            topUpPure,
            runningExcludedStems,
            acceptedItems,
            `${topUpCtx.title} ${topUpDetails}`
          );
          const slotsLeft = targetQuizSize - acceptedItems.length;
          // Only add genuinely new items; never pad the quiz with repeats
          const toAdd = extraUnique.slice(0, slotsLeft);
          if (toAdd.length > 0) {
            addAcceptedItems(toAdd);
            for (const item of toAdd) {
              runningExcludedStems.push(item.stem);
            }
            commitProgressiveWave([...acceptedItems]);
          }
        }
      }

      const finalQuizItems: BoardQuestionItem[] = (
        acceptedItems.length > 0 ? acceptedItems : fallbackPureMapped
      ).slice(0, targetQuizSize);

      if (finalQuizItems.length === 0) {
        throw new Error(
          batchErrors[0] || 'No questions were returned. Please try again.'
        );
      }

      if (appendMode) {
        const addedCount = finalQuizItems.length - existingQuizItems.length;
        if (addedCount <= 0) {
          throw new Error(
            batchErrors[0] ||
              'Could not generate the remaining items right now (the AI service may be busy or rate limited). Please try again in a minute.'
          );
        }
        onRecordSeenStems(finalQuizItems.slice(existingQuizItems.length).map((q) => q.stem));
        setGenBanner(
          finalQuizItems.length < targetQuizSize
            ? `Added ${addedCount} item(s). The quiz has ${finalQuizItems.length} of ${targetQuizSize} — you can generate the rest again.`
            : `Added ${addedCount} item(s). Your quiz is complete (${finalQuizItems.length} of ${targetQuizSize}).`
        );
        return;
      }

      if (!hasCommittedFirstWave) {
        commitProgressiveWave(finalQuizItems);
      }

      onRecordSeenStems(finalQuizItems.map((q) => q.stem));
      setGenBanner(
        lockedSectionLetter
          ? `Generated ${finalQuizItems.length} fresh Section ${lockedSectionLetter} Quiz questions (strictly isolated to ${lockedSectionTitle || title}).`
          : `Generated ${finalQuizItems.length} fresh Quiz questions.`
      );
    } catch (err: unknown) {
      setGenError(
        err instanceof Error ? err.message : 'Unable to generate quiz questions right now.'
      );
      setGenBanner(null);
    } finally {
      if (quizRunNonceRef.current === currentRunNonce) {
        setIsGeneratingQuiz(false);
        setIsGenerating(false);
      }
    }
  };

  // 3. Generate Subject-Specific 3-Hour Mock Board Exam (130 Items for Psych Assessment, 100 Items for Dev/Abn/IO)
  const handleGenerateMockExam100 = async () => {
    // Small batches keep every AI request short and under per-minute token limits
    const batches = buildMockExamSectionBatches(subject.sections, subjectMockSize, 6);
    setIsGenerating(true);
    setGenError(null);
    setGenBanner(
      `Generating ${subjectMockSize}-Item 3-Hour BLEPP Mock Exam (0 / ${subjectMockSize} items)...`
    );

    try {
      const pdfRefs = await preparePdfRefsForApi();
      const itemsByBatch = new Map<number, BoardQuestionItem[]>();
      const runningExcludedStems: string[] = Array.from(
        new Set([
          ...seenStems,
          ...questions.map((q) => q.stem),
          ...subject.seedQuestions.map((q) => q.stem),
        ])
      );
      const countReady = () =>
        Array.from(itemsByBatch.values()).reduce((sum, list) => sum + list.length, 0);

      const runBatch = async (batch: (typeof batches)[number]): Promise<BoardQuestionItem[]> => {
        const { title, details } = resolveScopeDescription(batch.sectionId);
        const batchIsolation = buildStrictSectionIsolationSpec(
          subject.id,
          subject.sections,
          batch.sectionId
        );
        const res = await postGeminiJsonWithPdfRetry(
          '/api/gemini/questions',
          {
            subjectTitle: subject.fullTitle,
            scopeTitle: title,
            competencyDetails: details,
            count: batch.count,
            difficultyFilter,
            lockedSectionLetter: batch.sectionLetter,
            lockedSectionTitle: batch.sectionTitle,
            excludedSectionsDetails: batchIsolation.excludedSiblingSectionsText || '',
            domainBoundaryNote: batchIsolation.domainBoundaryNote || '',
            excludeStems: runningExcludedStems.slice(-25),
            compactMode: true,
          },
          pdfRefs
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed on Mock Exam batch ${batch.batchIndex}.`);
        }

        const payload = await res.json();
        const rawArr = Array.isArray(payload.questions) ? payload.questions : [];
        return rawArr
          .slice(0, batch.count)
          .map((q: any, idx: number) =>
            mapRawQuestion(q, batch.batchIndex * 100 + idx, title, batch.sectionLetter)
          );
      };

      // Up to 3 batches at a time; failed batches (rate limits, malformed AI output) are retried
      // in later rounds instead of failing the whole exam.
      let pending = [...batches];
      let lastBatchError = '';
      for (let round = 0; round < 4 && pending.length > 0; round++) {
        if (round > 0) {
          setGenBanner(
            `The AI service is busy. Retrying ${pending.length} batch(es) in a moment (${countReady()} / ${subjectMockSize} items ready)...`
          );
          await new Promise((resolve) => setTimeout(resolve, round * 12000));
        }

        const stillPending: typeof pending = [];
        for (let i = 0; i < pending.length; i += 3) {
          const wave = pending.slice(i, i + 3);
          const settled = await Promise.allSettled(wave.map((batch) => runBatch(batch)));
          settled.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
              itemsByBatch.set(wave[idx].batchIndex, result.value);
              for (const item of result.value) runningExcludedStems.push(item.stem);
            } else {
              stillPending.push(wave[idx]);
              lastBatchError =
                result.reason instanceof Error ? result.reason.message : String(result.reason);
            }
          });

          setGenBanner(
            `Generating ${subjectMockSize}-Item 3-Hour BLEPP Mock Exam (${Math.min(
              subjectMockSize,
              countReady()
            )} / ${subjectMockSize} items ready)...`
          );
        }
        pending = stillPending;
      }

      if (pending.length > 0) {
        throw new Error(
          `Only ${countReady()} of ${subjectMockSize} items could be generated because the AI service kept failing (${lastBatchError || 'unknown error'}). Please wait a minute and try again.`
        );
      }

      const accumulated: BoardQuestionItem[] = Array.from(itemsByBatch.entries())
        .sort((x, y) => x[0] - y[0])
        .flatMap(([, list]) => list);

      const finalMockItems = accumulated.slice(0, subjectMockSize);
      onRecordSeenStems(finalMockItems.map((q) => q.stem));

      // Keep active 15-item Practice Quiz intact while storing the Mock Exam
      onUpdateQuestions((prevQs) => {
        const quizIdSet = new Set(sessionProgress.practice.activeQuestionIds || []);
        const retainedQuizQs = prevQs.filter((q) => quizIdSet.has(q.id));
        return [...retainedQuizQs, ...finalMockItems];
      });

      setIsExamTimerRunning(false);
      setExamSecondsLeft(fullMockSeconds);
      onUpdateSessionProgress((prev) => ({
        ...prev,
        mock: {
          ...prev.mock,
          shadedMap: {},
          flaggedItems: {},
          mockSubmitted: false,
          examSecondsLeft: fullMockSeconds,
          selectedScope: 'ALL',
          activeQuestionIds: finalMockItems.map((q) => q.id),
          updatedAt: 0,
        },
      }));

      setStudyMode('mock');
      setGenBanner(
        `Ready: ${finalMockItems.length}-Item BLEPP Mock Exam loaded with 03:00:00 (3-Hour) timer.`
      );
    } catch (err: unknown) {
      setGenError(
        err instanceof Error
          ? err.message
          : `Unable to generate ${subjectMockSize}-item mock exam right now.`
      );
      setGenBanner(null);
    } finally {
      setIsGenerating(false);
    }
  };

  // Strict separation between Practice Quiz items (15 items, strictly section-filtered) and Mock Exam items (100 items)
  const practiceDisplayedQuestions = filterQuestionsStrictByScope(
    questions,
    practiceScope,
    subject.sections,
    sessionProgress.practice.activeQuestionIds
  );

  const mockDisplayedQuestions = sessionProgress.mock.activeQuestionIds?.length
    ? filterQuestionsStrictByScope(
        questions,
        'ALL',
        subject.sections,
        sessionProgress.mock.activeQuestionIds
      )
    : [];

  const activeFlashcardDeck = flashcards.slice(0, FLASHCARD_DECK_SIZE);
  const filteredFlashcards = activeFlashcardDeck.filter((c) => {
    if (fcFilter === 'all') return true;
    return c.status === fcFilter;
  });
  const activeCard =
    filteredFlashcards[Math.min(fcIndex, Math.max(0, filteredFlashcards.length - 1))] ||
    activeFlashcardDeck[0];

  const keyItems: ExamAnswerKeyItem[] = mockDisplayedQuestions.map((q, idx) => ({
    itemNumber: idx + 1,
    correctChoice: q.correctChoice,
    sectionCode: q.sectionCode,
    bloomsLevel: q.bloomsLevel,
  }));

  const answerKeyMap: Record<number, 'A' | 'B' | 'C' | 'D' | 'E'> = {};
  mockDisplayedQuestions.forEach((q, idx) => {
    answerKeyMap[idx + 1] = q.correctChoice;
  });

  const mockGradeResult = gradePrcAnswerSheet(keyItems, mockShadedMap);

  // Mastery percentages per section and subsection, from your saved answers
  const masteryStats = computeMasteryStats(attemptLogs || [], subject.id, subject.sections);
  const masteryTone = (pct: number | null) =>
    pct === null
      ? 'text-slate-500 dark:text-[#9FB0C7]'
      : pct >= COMPETENCY_MASTERY_THRESHOLD_PERCENT
      ? 'text-[#1E7A5F] dark:text-[#68C7C5]'
      : pct >= 50
      ? 'text-[#8C4D11] dark:text-[#F2AE63]'
      : 'text-rose-600 dark:text-rose-400';
  const masteryBarTone = (pct: number | null) =>
    pct === null
      ? 'bg-slate-300 dark:bg-[#293D5C]'
      : pct >= COMPETENCY_MASTERY_THRESHOLD_PERCENT
      ? 'bg-[#2E7978]'
      : pct >= 50
      ? 'bg-[#D9822B]'
      : 'bg-rose-500';
  const masteryLabel = (pct: number | null) =>
    pct === null
      ? 'Not started'
      : pct >= COMPETENCY_MASTERY_THRESHOLD_PERCENT
      ? 'Mastered'
      : pct >= 50
      ? 'Developing'
      : 'Needs work';

  // Evaluate Practice Quiz progress & automatic Section Goal mastery
  const quizEval = evaluateQuizCompletionAndSectionGoals(
    practiceDisplayedQuestions,
    submittedPracticeAnswers,
    practiceScope,
    subject.sections,
    masteryStats.byCompetency
  );

  // Automatically clear Section Goals only when all items are answered AND progressive generation is complete
  const clearedIdsKey = quizEval.clearedCompetencyIds.join(',');
  useEffect(() => {
    if (isGeneratingQuiz || !quizEval.isAllAnswered || quizEval.clearedCompetencyIds.length === 0) {
      return;
    }
    const missingAny = quizEval.clearedCompetencyIds.some(
      (id) => !masteredCompetencies[id]
    );
    if (missingAny) {
      onMarkCompetenciesMastered(quizEval.clearedCompetencyIds);
    }
  }, [
    isGeneratingQuiz,
    quizEval.isAllAnswered,
    clearedIdsKey,
    masteredCompetencies,
    onMarkCompetenciesMastered,
    quizEval.clearedCompetencyIds,
  ]);

  const handleExplicitSaveQuizProgress = async (markCompleted: boolean) => {
    setSaveFeedback('saving');
    setSaveNotice(null);
    if (quizEval.clearedCompetencyIds.length > 0) {
      onMarkCompetenciesMastered(quizEval.clearedCompetencyIds);
    }
    if (markCompleted) {
      onUpdateSessionProgress((prev) => ({
        ...prev,
        practice: {
          ...prev.practice,
          completedAt: Date.now(),
          updatedAt: Date.now(),
        },
      }));
    }
    // Wait one tick so latest state ref captures session update before flushing to cloud
    await new Promise((r) => window.setTimeout(r, 20));
    // Never leave the button stuck on "Saving…": the copy on this device is written first, and the cloud
    // upload keeps running in the background if it is slow.
    const outcome = await Promise.race<'ok' | 'failed' | 'slow'>([
      onSaveProgressNow()
        .then((ok) => (ok ? 'ok' : 'failed') as 'ok' | 'failed')
        .catch(() => 'failed' as const),
      new Promise<'slow'>((resolve) => window.setTimeout(() => resolve('slow'), 8000)),
    ]);
    setSaveFeedback('saved');
    if (outcome === 'slow') {
      setSaveNotice('Saved on this device. The cloud upload is taking a while and will finish in the background.');
    } else if (outcome === 'failed') {
      setSaveNotice('Saved on this device, but the cloud upload failed. It will retry automatically on your next change.');
    }
  };

  const handleSelectDraftPracticeChoice = (
    questionId: string,
    choice: 'A' | 'B' | 'C' | 'D'
  ) => {
    if (submittedPracticeAnswers[questionId]) return;
    setSaveFeedback('idle');
    setSaveNotice(null);
    onUpdateSessionProgress((prev) => ({
      ...prev,
      practice: {
        ...prev.practice,
        draftChoices: {
          ...prev.practice.draftChoices,
          [questionId]: choice,
        },
        completedAt: 0,
        updatedAt: Date.now(),
      },
    }));
  };

  const handleSubmitPracticeAnswer = (q: BoardQuestionItem) => {
    if (submittedPracticeAnswers[q.id]) return;
    const chosen = draftPracticeChoices[q.id];
    if (!chosen) return;
    setSaveFeedback('idle');
    setSaveNotice(null);

    onUpdateSessionProgress((prev) => ({
      ...prev,
      practice: {
        ...prev.practice,
        submittedAnswers: {
          ...prev.practice.submittedAnswers,
          [q.id]: chosen,
        },
        completedAt: 0,
        updatedAt: Date.now(),
      },
    }));

    onRecordQuestionAttempts([
      {
        id: `att_${Date.now()}_${q.id}`,
        questionId: q.id,
        subjectId: subject.id,
        sectionCode: q.sectionCode,
        tosCode: q.tosCode,
        bloomsLevel: q.bloomsLevel,
        selectedChoice: chosen,
        correctChoice: q.correctChoice,
        isCorrect: chosen === q.correctChoice,
        timestamp: Date.now(),
        mode: 'practice',
      },
    ]);
  };

  const handleTogglePrcSheetChoice = (
    itemNumber: number,
    letter: 'A' | 'B' | 'C' | 'D' | 'E'
  ) => {
    if (mockSubmitted) return;
    onUpdateSessionProgress((prev) => {
      const current = prev.mock.shadedMap[itemNumber];
      return {
        ...prev,
        mock: {
          ...prev.mock,
          examSecondsLeft: examSecondsRef.current,
          shadedMap: {
            ...prev.mock.shadedMap,
            [itemNumber]: current === letter ? 'BLANK' : letter,
          },
          updatedAt: Date.now(),
        },
      };
    });
  };

  const recordMockAttempts = (shaded: Record<number, ShadedChoice>) => {
    const now = Date.now();
    const logs: QuestionAttemptLog[] = [];
    mockDisplayedQuestions.forEach((q, idx) => {
      const itemNum = idx + 1;
      const mark = shaded[itemNum];
      const chosen: 'A' | 'B' | 'C' | 'D' | 'E' =
        mark === 'A' || mark === 'B' || mark === 'C' || mark === 'D' || mark === 'E'
          ? mark
          : 'E';
      logs.push({
        id: `att_mock_${now}_${q.id}`,
        questionId: q.id,
        subjectId: subject.id,
        sectionCode: q.sectionCode,
        tosCode: q.tosCode,
        bloomsLevel: q.bloomsLevel,
        selectedChoice: chosen,
        correctChoice: q.correctChoice,
        isCorrect: mark === q.correctChoice,
        timestamp: now + idx,
        mode: 'mock',
      });
    });
    if (logs.length > 0) {
      onRecordQuestionAttempts(logs);
    }
  };

  const handleSubmitMockExam = () => {
    setIsExamTimerRunning(false);
    onUpdateSessionProgress((prev) => ({
      ...prev,
      mock: {
        ...prev.mock,
        examSecondsLeft: examSecondsRef.current,
        mockSubmitted: true,
        updatedAt: Date.now(),
      },
    }));
    if (mockDisplayedQuestions.length > 0) {
      onRecordMockScore(mockGradeResult.percentage);
      recordMockAttempts(mockShadedMap);
    }
  };

  const handleApplyScannedOmr = (detectedMap: Record<number, ShadedChoice>) => {
    setIsExamTimerRunning(false);
    onUpdateSessionProgress((prev) => ({
      ...prev,
      mock: {
        ...prev.mock,
        shadedMap: detectedMap,
        examSecondsLeft: examSecondsRef.current,
        mockSubmitted: true,
        updatedAt: Date.now(),
      },
    }));
    if (mockDisplayedQuestions.length > 0) {
      const graded = gradePrcAnswerSheet(keyItems, detectedMap);
      onRecordMockScore(graded.percentage);
      recordMockAttempts(detectedMap);
    }
  };

  const activeScopeSection =
    practiceScope !== 'ALL'
      ? subject.sections.find((s) => s.id === practiceScope) || null
      : null;

  const activeMockItemLimit =
    mockDisplayedQuestions.length > 0 ? mockDisplayedQuestions.length : subjectMockSize;
  const shadedActiveMockCount = Object.entries(mockShadedMap).filter(
    ([numStr, val]) =>
      Number(numStr) >= 1 &&
      Number(numStr) <= activeMockItemLimit &&
      Boolean(val) &&
      val !== 'BLANK'
  ).length;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* MINIMALIST SUBJECT HEADER & COMPACT ACTION BAR */}
      <section className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-4 sm:p-5 space-y-4 no-print transition-colors">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3.5 sm:gap-4">
          <div className="space-y-1">
            {onBackToHome && (
              <button
                type="button"
                onClick={onBackToHome}
                className="min-h-[32px] inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Home</span>
              </button>
            )}
            <h1 className="text-xl sm:text-2xl font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
              {subject.fullTitle}
            </h1>
          </div>

          {/* 4 STUDY MODE TABS — 2×2 GRID ON MOBILE, SINGLE ROW ON DESKTOP */}
          <div className="grid grid-cols-2 sm:flex w-full sm:w-auto items-center gap-1 p-1 bg-[#ECEFF3] dark:bg-[#0B1320] rounded-lg border border-slate-200/80 dark:border-[#22324D]">
            <button
              type="button"
              onClick={() => setStudyMode('tos')}
              className={`min-h-[40px] sm:min-h-0 px-3 sm:px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap text-center ${
                studyMode === 'tos'
                  ? 'bg-[#0D254C] dark:bg-[#234B82] text-white shadow-xs'
                  : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
              }`}
            >
              Syllabus
            </button>
            <button
              type="button"
              onClick={() => setStudyMode('flashcards')}
              className={`min-h-[40px] sm:min-h-0 px-3 sm:px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap text-center ${
                studyMode === 'flashcards'
                  ? 'bg-[#3B2006] dark:bg-[#D9822B] text-white dark:text-[#1C1208] shadow-xs'
                  : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#3B2006] dark:hover:text-[#F2AE63]'
              }`}
            >
              Flashcards ({activeFlashcardDeck.length || FLASHCARD_DECK_SIZE})
            </button>
            <button
              type="button"
              onClick={() => setStudyMode('practice')}
              className={`min-h-[40px] sm:min-h-0 px-3 sm:px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap text-center ${
                studyMode === 'practice'
                  ? 'bg-[#0D254C] dark:bg-[#9CC0F9] text-white dark:text-[#0B1320] shadow-xs'
                  : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
              }`}
            >
              Quiz (
              {isGeneratingQuiz
                ? `${quizEval.answeredCount}/${inFlightTargetSize}`
                : practiceDisplayedQuestions.length > 0
                ? `${quizEval.answeredCount}/${practiceDisplayedQuestions.length}`
                : activeQuizSize}
              )
            </button>
            <button
              type="button"
              onClick={() => setStudyMode('mock')}
              className={`min-h-[40px] sm:min-h-0 px-3 sm:px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap text-center ${
                studyMode === 'mock'
                  ? 'bg-[#2E7978] text-white shadow-xs'
                  : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#143D3C] dark:hover:text-[#68C7C5]'
              }`}
            >
              Mock Exam ({subjectMockSize})
            </button>
          </div>
        </div>

        {/* RESPONSIVE ACTION TOOLBAR */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2.5 sm:gap-3 pt-3 border-t border-slate-100 dark:border-[#22324D]">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {studyMode !== 'flashcards' && studyMode !== 'mock' && (
                <select
                  aria-label="Select quiz item count"
                  value={getQuizSizeForScope('ALL')}
                  disabled={isGenerating}
                  onChange={(e) => setQuizSizeForScope('ALL', Number(e.target.value))}
                  className="min-h-[40px] sm:min-h-0 px-2.5 py-1.5 bg-[#F8FAFC] dark:bg-[#1A2942] border border-slate-300 dark:border-[#293D5C] rounded-lg text-xs font-mono font-semibold text-[#0F172A] dark:text-[#E6ECF5] disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {QUIZ_ITEM_COUNT_OPTIONS.map((cnt) => (
                    <option key={cnt} value={cnt}>
                      {cnt} items
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => {
                  if (studyMode === 'flashcards') {
                    handleGenerateFlashcards();
                  } else if (studyMode === 'mock') {
                    handleGenerateMockExam100();
                  } else {
                    // The toolbar button always means the WHOLE subject (all sections by TOS weight),
                    // never whichever section was generated last.
                    handleGeneratePracticeQuiz('ALL', getQuizSizeForScope('ALL'));
                  }
                }}
                className={`flex-1 sm:flex-initial min-h-[40px] sm:min-h-0 inline-flex items-center justify-center px-3 py-1.5 disabled:opacity-50 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  studyMode === 'mock'
                    ? 'bg-[#2E7978] hover:bg-[#246160] text-white'
                    : studyMode === 'flashcards'
                    ? 'bg-[#D9822B] hover:bg-[#C57320] text-[#1C1208]'
                    : 'bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] text-white'
                }`}
              >
                <span>
                  {studyMode === 'flashcards'
                    ? `Generate ${FLASHCARD_DECK_SIZE} Flashcards`
                    : studyMode === 'mock'
                    ? `Generate ${subjectMockSize}-Item Mock`
                    : `Generate ${getQuizSizeForScope('ALL')}-Item Quiz`}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onLoadOfficialTosBank(
                  studyMode === 'flashcards' ? 'flashcards' : 'practice'
                );
              }}
              className="min-h-[38px] sm:min-h-0 inline-flex items-center justify-center px-3 py-1.5 bg-[#E6F4F4] dark:bg-[#112A2D] hover:bg-[#D5ECEC] dark:hover:bg-[#17383C] text-[#143D3C] dark:text-[#D5F2F1] border border-[#2E7978]/40 dark:border-[#2E7978]/75 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span>Load PRC Starter</span>
            </button>

            <label className="min-h-[38px] sm:min-h-0 inline-flex items-center justify-center px-3 py-1.5 bg-white dark:bg-[#1A2942] hover:bg-slate-50 dark:hover:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] border border-slate-300 dark:border-[#293D5C] text-xs font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0">
              <span>Upload PDF</span>
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={handlePdfUpload}
                className="hidden"
              />
            </label>

            {studyMode === 'tos' && (
              <button
                type="button"
                onClick={() => setIsOfficialTosPdfOpen(true)}
                className="min-h-[38px] sm:min-h-0 inline-flex items-center justify-center px-3 py-1.5 bg-[#FDF3E7] dark:bg-[#2C1D10] hover:bg-[#FAE6CE] dark:hover:bg-[#3A2615] text-[#3B2006] dark:text-[#F7DEC2] border border-[#D9822B]/55 dark:border-[#9A5B1E] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span className="sm:hidden">TOS PDF ({subject.officialPdfPageRange})</span>
                <span className="hidden sm:inline">Official TOS PDF ({subject.officialPdfPageRange})</span>
              </button>
            )}

            {pdfFiles.map((pdf) => (
              <div
                key={pdf.id}
                className={`min-h-[34px] sm:min-h-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs ${
                  pdf.active
                    ? 'bg-[#EDF2FA] dark:bg-[#1A2D4A] border-[#0D254C]/25 dark:border-[#9CC0F9]/45 text-[#0D254C] dark:text-[#9CC0F9]'
                    : 'bg-slate-50 dark:bg-[#1A2942] border-slate-200 dark:border-[#293D5C] text-slate-500 dark:text-[#9FB0C7]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={pdf.active}
                  onChange={() => onTogglePdfActive(pdf.id)}
                  aria-label={`Use ${pdf.name}`}
                  className="accent-[#0D254C] dark:accent-[#68C7C5] rounded cursor-pointer"
                />
                <span className="max-w-[140px] truncate">{pdf.name}</span>
                <button
                  type="button"
                  onClick={() => onRemovePdfFile(pdf.id)}
                  aria-label={`Remove ${pdf.name}`}
                  className="p-1 text-[#475569] dark:text-[#9FB0C7] hover:text-rose-700 dark:hover:text-rose-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            aria-expanded={showAiGenerator}
            onClick={() => setShowAiGenerator((v) => !v)}
            className={`w-full sm:w-auto min-h-[38px] sm:min-h-0 inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              showAiGenerator
                ? 'bg-[#2D3136] dark:bg-[#334663] text-white border-[#2D3136] dark:border-[#475F85]'
                : 'bg-[#2D3136] hover:bg-[#1E2226] dark:bg-[#1A2942] dark:hover:bg-[#243858] text-white dark:text-[#E6ECF5] border-[#2D3136] dark:border-[#293D5C]'
            }`}
          >
            <span>Quiz Generator Options</span>
          </button>
        </div>

        {/* COLLAPSIBLE AI GENERATOR OPTIONS DRAWER */}
        {showAiGenerator && (
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 pt-3 border-t border-slate-100 dark:border-[#22324D]">
            <select
              aria-label="Select PRC TOS Section or Scope"
              value={practiceScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              className="w-full sm:w-auto sm:max-w-[260px] min-h-[40px] sm:min-h-0 px-3 py-1.5 bg-[#F8FAFC] dark:bg-[#1A2942] border border-slate-200 dark:border-[#293D5C] rounded-lg text-xs font-medium text-[#0F172A] dark:text-[#E6ECF5]"
            >
              <option value="ALL">All Sections (Proportional)</option>
              {subject.sections.map((sec: TosSection) => (
                <option key={sec.id} value={sec.id}>
                  Sec {sec.sectionLetter}: {sec.title} ({sec.weightPercent}%)
                </option>
              ))}
            </select>

            <select
              aria-label="Select Bloom's Difficulty Distribution"
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              className="w-full sm:w-auto min-h-[40px] sm:min-h-0 px-3 py-1.5 bg-[#F8FAFC] dark:bg-[#1A2942] border border-slate-200 dark:border-[#293D5C] rounded-lg text-xs font-medium text-[#0F172A] dark:text-[#E6ECF5]"
            >
              <option value="TOS_PROPORTIONAL">Balanced (30/40/30)</option>
              <option value="Easy (Remembering & Understanding)">Easy</option>
              <option value="Moderate (Applying - Case Vignettes)">Moderate</option>
              <option value="Difficult (Analyzing, Evaluating, Creating)">Difficult</option>
            </select>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => handleGenerateFlashcards(practiceScope)}
                className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#D9822B] hover:bg-[#C57320] disabled:opacity-50 text-[#1C1208] text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span>Generate {FLASHCARD_DECK_SIZE} Flashcards</span>
              </button>

              <select
                aria-label="Select quiz item count in generator options"
                value={activeQuizSize}
                disabled={isGenerating}
                onChange={(e) => setQuizSizeForScope(practiceScope, Number(e.target.value))}
                className="min-h-[38px] sm:min-h-0 px-2.5 py-1.5 bg-[#F8FAFC] dark:bg-[#1A2942] border border-slate-200 dark:border-[#293D5C] rounded-lg text-xs font-mono font-semibold text-[#0F172A] dark:text-[#E6ECF5] disabled:opacity-50 cursor-pointer"
              >
                {QUIZ_ITEM_COUNT_OPTIONS.map((cnt) => (
                  <option key={cnt} value={cnt}>
                    {cnt} items
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={isGenerating}
                onClick={() => handleGeneratePracticeQuiz(practiceScope, activeQuizSize)}
                className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span>
                  Generate {activeQuizSize}-Item{' '}
                  {activeScopeSection ? `Section ${activeScopeSection.sectionLetter} ` : 'Full Subject '}
                  Quiz
                </span>
              </button>

              <button
                type="button"
                disabled={isGenerating}
                onClick={handleGenerateMockExam100}
                className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2E7978] hover:bg-[#246160] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span>Generate {subjectMockSize}-Item Mock (3 Hr)</span>
              </button>
            </div>
          </div>
        )}

        {genBanner && (
          <div className="px-3.5 py-2 bg-[#EDF2FA] dark:bg-[#1A2D4A] border border-[#0D254C]/25 dark:border-[#9CC0F9]/40 rounded-lg text-xs text-[#0D254C] dark:text-[#D9E7FD] flex items-center justify-between">
            <span>{genBanner}</span>
            <button
              type="button"
              onClick={() => setGenBanner(null)}
              className="text-xs font-semibold hover:underline ml-4 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {genError && (
          <div className="px-3.5 py-2 bg-[#FDF3E7] dark:bg-[#2C1D10] border border-[#D9822B] dark:border-[#9A5B1E] rounded-lg text-xs text-[#3B2006] dark:text-[#F7DEC2] flex items-center justify-between">
            <span>{genError}</span>
            <button
              type="button"
              onClick={() => setGenError(null)}
              className="text-xs font-semibold hover:underline ml-4 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
      </section>

      {/* =====================================================================
          MODE 1: PRC TOS COMPETENCY CHECKLIST (FEB 2023 ANNEX "B" — PQF LEVEL 6)
      ===================================================================== */}
      {studyMode === 'tos' && (
        <section className="space-y-4">
          {subject.sections.map((section: TosSection, secIdx: number) => {
            const totalComps = section.competencies.length;
            const masteredCount = section.competencies.filter(
              (c) => masteredCompetencies[c.id]
            ).length;
            const secMastery = masteryStats.bySection[section.id] || {
              attempts: 0,
              correct: 0,
              accuracyPercent: null,
              masteryPercent: null,
              hasEnoughData: false,
              practicedGoals: 0,
              totalGoals: totalComps,
            };
            const secBandTone =
              secIdx % 3 === 0
                ? {
                    bg: 'bg-[#EDF2FA]/85 dark:bg-[#172844]',
                    title: 'text-[#0D254C] dark:text-[#F8FAFC]',
                    meta: 'text-[#334155] dark:text-[#C5D2E3]',
                    btn: 'bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] text-white',
                  }
                : secIdx % 3 === 1
                ? {
                    bg: 'bg-[#E6F4F4]/85 dark:bg-[#112A2D]',
                    title: 'text-[#143D3C] dark:text-[#D5F2F1]',
                    meta: 'text-[#1E5655] dark:text-[#B8E6E5]',
                    btn: 'bg-[#2E7978] hover:bg-[#246160] text-white',
                  }
                : {
                    bg: 'bg-[#FDF3E7] dark:bg-[#2A1C10]',
                    title: 'text-[#3B2006] dark:text-[#F7DEC2]',
                    meta: 'text-[#6B3B0D] dark:text-[#F2AE63]',
                    btn: 'bg-[#3B2006] hover:bg-[#522D0A] dark:bg-[#D9822B] dark:hover:bg-[#E5923D] text-white dark:text-[#1C1208]',
                  };

            const secQuizSize = getQuizSizeForScope(section.id);

            return (
              <div
                key={section.id}
                id={`tos-section-${section.id}`}
                className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl overflow-hidden transition-colors"
              >
                <div className={`px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200/70 dark:border-[#22324D] flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 sm:gap-4 ${secBandTone.bg}`}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className={`text-base sm:text-lg font-display font-semibold ${secBandTone.title}`}>
                        Section {section.sectionLetter}. {section.title}
                      </h2>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${masteryTone(
                          secMastery.masteryPercent
                        )}`}
                      >
                        {secMastery.masteryPercent !== null &&
                          secMastery.masteryPercent >= COMPETENCY_MASTERY_THRESHOLD_PERCENT && (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                        <span>
                          {secMastery.masteryPercent === null
                            ? 'Mastery: not started'
                            : `Mastery ${secMastery.masteryPercent}% · ${masteryLabel(
                                secMastery.masteryPercent
                              )}`}
                        </span>
                      </span>
                    </div>
                    <p className={`text-xs font-mono mt-0.5 ${secBandTone.meta}`}>
                      {section.weightPercent}% of exam ·{' '}
                      {secMastery.attempts > 0
                        ? `${secMastery.correct}/${secMastery.attempts} correct (${secMastery.accuracyPercent}% raw) · `
                        : ''}
                      {secMastery.practicedGoals}/{totalComps} goals practiced · {masteredCount}/
                      {totalComps} goals mastered
                    </p>
                    <div
                      className="mt-1.5 h-1.5 w-full max-w-xs rounded-full bg-slate-200/80 dark:bg-[#22324D] overflow-hidden"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={secMastery.masteryPercent ?? 0}
                      aria-label={`Section ${section.sectionLetter} mastery`}
                    >
                      <div
                        className={`h-full rounded-full ${masteryBarTone(secMastery.masteryPercent)}`}
                        style={{ width: `${secMastery.masteryPercent ?? 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                    <select
                      aria-label={`Number of quiz items for Section ${section.sectionLetter}`}
                      value={secQuizSize}
                      disabled={isGenerating}
                      onChange={(e) => setQuizSizeForScope(section.id, Number(e.target.value))}
                      className="min-h-[40px] sm:min-h-0 px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold bg-white/95 dark:bg-[#0B1320]/90 text-[#0F172A] dark:text-[#E6ECF5] border border-slate-300/90 dark:border-[#293D5C] disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {QUIZ_ITEM_COUNT_OPTIONS.map((cnt) => (
                        <option key={cnt} value={cnt}>
                          {cnt} items
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleGeneratePracticeQuiz(section.id, secQuizSize)}
                      className={`flex-1 sm:flex-initial min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap inline-flex items-center justify-center shrink-0 ${secBandTone.btn}`}
                    >
                      <span className="sm:hidden">
                        Sec {section.sectionLetter} Quiz ({secQuizSize}) →
                      </span>
                      <span className="hidden sm:inline">
                        Generate {secQuizSize}-Item Section {section.sectionLetter} Quiz →
                      </span>
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-[#22324D]">
                  {section.competencies.map((comp: TosCompetency) => {
                    const isMastered = Boolean(masteredCompetencies[comp.id]);
                    const compMastery = masteryStats.byCompetency[comp.id] || {
                      attempts: 0,
                      correct: 0,
                      accuracyPercent: null,
                      masteryPercent: null,
                      hasEnoughData: false,
                    };

                    return (
                      <button
                        key={comp.id}
                        type="button"
                        onClick={() => onToggleCompetency(comp.id)}
                        className="w-full px-4 sm:px-6 py-3.5 flex items-start justify-between gap-3 sm:gap-4 text-left hover:bg-slate-50/70 dark:hover:bg-[#1A2942]/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {isMastered ? (
                            <CheckSquare className="w-4 h-4 text-[#2E7978] dark:text-[#68C7C5] shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-4 h-4 text-[#475569] dark:text-[#9FB0C7] shrink-0 mt-0.5" />
                          )}
                          <span
                            className={`font-sans text-xs sm:text-sm ${
                              isMastered
                                ? 'line-through text-[#475569] dark:text-[#9FB0C7]'
                                : 'font-medium text-[#0F172A] dark:text-[#E6ECF5]'
                            }`}
                          >
                            <strong className="font-mono text-slate-500 dark:text-[#9FB0C7] font-normal mr-1.5">
                              {comp.code}
                            </strong>
                            {comp.description}
                          </span>
                        </div>

                        <span className="flex flex-col items-end gap-0.5 text-xs font-mono whitespace-nowrap shrink-0">
                          <span className="text-slate-500 dark:text-[#9FB0C7]">
                            {comp.itemCount} {comp.itemCount === 1 ? 'item' : 'items'}
                          </span>
                          <span
                            className={
                              compMastery.hasEnoughData
                                ? masteryTone(compMastery.masteryPercent)
                                : 'text-slate-500 dark:text-[#9FB0C7]'
                            }
                          >
                            {compMastery.attempts === 0
                              ? 'No data yet'
                              : compMastery.hasEnoughData
                              ? `Mastery ${compMastery.masteryPercent}% · ${compMastery.correct}/${compMastery.attempts} correct`
                              : `${compMastery.correct}/${compMastery.attempts} correct · too few answers`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* =====================================================================
          MODE 2: 5-CARD STUDY FLASHCARDS
      ===================================================================== */}
      {studyMode === 'flashcards' && (
        <section className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-6 transition-colors">
          {activeFlashcardDeck.length === 0 ? (
            <div className="text-center py-8 sm:py-12 max-w-sm mx-auto space-y-4">
              <div className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
                No Flashcards Loaded ({FLASHCARD_DECK_SIZE} per Deck)
              </div>
              <p className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                Load the {FLASHCARD_DECK_SIZE}-card PRC starter deck or generate{' '}
                {FLASHCARD_DECK_SIZE} fresh cards.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onLoadOfficialTosBank('flashcards')}
                  className="min-h-[40px] px-4 py-2 bg-[#2D3136] dark:bg-[#1A2942] dark:border dark:border-[#293D5C] hover:bg-[#1E2226] dark:hover:bg-[#243858] text-white text-xs font-semibold rounded-lg"
                >
                  Load {FLASHCARD_DECK_SIZE} PRC Cards
                </button>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleGenerateFlashcards()}
                  className="min-h-[40px] px-4 py-2 bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] text-white text-xs font-semibold rounded-lg"
                >
                  Generate {FLASHCARD_DECK_SIZE} Cards
                </button>
              </div>
            </div>
          ) : (
            activeCard && (
              <>
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 sm:gap-4 border-b border-slate-200 dark:border-[#22324D] pb-4">
                  <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 bg-[#ECEFF3] dark:bg-[#0B1320] rounded-lg border border-slate-200 dark:border-[#22324D]">
                    <button
                      type="button"
                      onClick={() => {
                        setFcFilter('all');
                        setFcIndex(0);
                      }}
                      className={`min-h-[36px] sm:min-h-0 px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-medium rounded whitespace-nowrap truncate ${
                        fcFilter === 'all'
                          ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] shadow-xs'
                          : 'text-slate-600 dark:text-[#9FB0C7]'
                      }`}
                    >
                      All ({activeFlashcardDeck.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFcFilter('learning');
                        setFcIndex(0);
                      }}
                      className={`min-h-[36px] sm:min-h-0 px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-medium rounded whitespace-nowrap truncate ${
                        fcFilter === 'learning'
                          ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] shadow-xs'
                          : 'text-slate-600 dark:text-[#9FB0C7]'
                      }`}
                    >
                      Learning (
                      {activeFlashcardDeck.filter((c) => c.status === 'learning').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFcFilter('mastered');
                        setFcIndex(0);
                      }}
                      className={`min-h-[36px] sm:min-h-0 px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-medium rounded whitespace-nowrap truncate ${
                        fcFilter === 'mastered'
                          ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] shadow-xs'
                          : 'text-slate-600 dark:text-[#9FB0C7]'
                      }`}
                    >
                      Mastered (
                      {activeFlashcardDeck.filter((c) => c.status === 'mastered').length})
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2 sm:gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        const shuffled = [...activeFlashcardDeck].sort(
                          () => Math.random() - 0.5
                        );
                        onUpdateFlashcards(shuffled);
                        setFcIndex(0);
                        setIsFlipped(false);
                      }}
                      className="min-h-[36px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ECEFF3] dark:bg-[#1A2942] hover:bg-slate-200 dark:hover:bg-[#243858] text-[#0F172A] dark:text-[#E6ECF5] rounded-md font-medium"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      <span>Shuffle</span>
                    </button>
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleGenerateFlashcards()}
                      className="min-h-[36px] sm:min-h-0 px-2.5 py-1.5 text-[#0D254C] dark:text-[#9CC0F9] hover:underline font-semibold"
                    >
                      New {FLASHCARD_DECK_SIZE}-Card Deck
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateFlashcards([])}
                      className="min-h-[36px] sm:min-h-0 px-2.5 py-1.5 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-w-3xl mx-auto">
                  <button
                    type="button"
                    onClick={() => setIsFlipped((f) => !f)}
                    aria-label="Flip flashcard between term and definition"
                    className="w-full text-left bg-[#F8FAFC] dark:bg-[#1A2942]/80 hover:bg-[#ECEFF3]/80 dark:hover:bg-[#1A2942] border border-slate-200 dark:border-[#293D5C] rounded-xl p-5 sm:p-10 min-h-[220px] sm:min-h-[250px] flex flex-col justify-between transition-all cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-[#9FB0C7] font-mono w-full">
                      <span>
                        Card #{Math.min(fcIndex + 1, filteredFlashcards.length)} of{' '}
                        {filteredFlashcards.length}
                      </span>
                      <span>
                        {isFlipped ? 'DEFINITION' : 'TERM'} · {activeCard.bloomsLevel}
                      </span>
                    </div>

                    <div className="my-5 sm:my-6">
                      {!isFlipped ? (
                        <h3 className="text-lg sm:text-2xl font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5] leading-snug">
                          {activeCard.term}
                        </h3>
                      ) : (
                        <p className="font-sans text-sm sm:text-base text-[#0F172A] dark:text-[#E6ECF5] whitespace-pre-line leading-relaxed">
                          {activeCard.definition}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-[#0D254C] dark:text-[#9CC0F9] font-medium w-full pt-3 border-t border-slate-200/80 dark:border-[#293D5C]">
                      <span className="inline-flex items-center gap-1.5">
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Tap card to flip</span>
                      </span>
                      <span className="font-mono text-slate-500 dark:text-[#9FB0C7]">
                        {Math.min(fcIndex + 1, filteredFlashcards.length)} /{' '}
                        {filteredFlashcards.length}
                      </span>
                    </div>
                  </button>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 mt-4 sm:mt-5">
                    <div className="grid grid-cols-2 sm:flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFcIndex((i) =>
                            i > 0 ? i - 1 : Math.max(0, filteredFlashcards.length - 1)
                          );
                          setIsFlipped(false);
                        }}
                        className="min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1 px-3.5 py-2 bg-[#ECEFF3] dark:bg-[#1A2942] hover:bg-slate-200 dark:hover:bg-[#243858] text-[#0F172A] dark:text-[#E6ECF5] text-xs font-semibold rounded-lg"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Previous</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFcIndex((i) => (i + 1 < filteredFlashcards.length ? i + 1 : 0));
                          setIsFlipped(false);
                        }}
                        className="min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1 px-3.5 py-2 bg-[#ECEFF3] dark:bg-[#1A2942] hover:bg-slate-200 dark:hover:bg-[#243858] text-[#0F172A] dark:text-[#E6ECF5] text-xs font-semibold rounded-lg"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:flex items-center gap-2 sm:gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = activeFlashcardDeck.map((c) =>
                            c.id === activeCard.id ? { ...c, status: 'learning' as const } : c
                          );
                          onUpdateFlashcards(updated);
                          setIsFlipped(false);
                          setFcIndex((i) => (i + 1 < filteredFlashcards.length ? i + 1 : 0));
                        }}
                        className="min-h-[42px] sm:min-h-0 px-3 sm:px-4 py-2 bg-[#FDF3E7] dark:bg-[#2C1D10] hover:bg-[#FAE6CE] dark:hover:bg-[#3A2615] text-[#3B2006] dark:text-[#F7DEC2] border border-[#D9822B] dark:border-[#9A5B1E] text-xs font-semibold rounded-lg text-center"
                      >
                        Still Learning
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = activeFlashcardDeck.map((c) =>
                            c.id === activeCard.id ? { ...c, status: 'mastered' as const } : c
                          );
                          onUpdateFlashcards(updated);
                          setIsFlipped(false);
                          setFcIndex((i) => (i + 1 < filteredFlashcards.length ? i + 1 : 0));
                        }}
                        className="min-h-[42px] sm:min-h-0 px-3 sm:px-4 py-2 bg-[#2E7978] hover:bg-[#246160] text-white text-xs font-semibold rounded-lg text-center"
                      >
                        Know It
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )
          )}
        </section>
      )}

      {/* =====================================================================
          MODE 3: 15-ITEM PRACTICE QUIZ MODE (STRICT SECTION SCOPE + SAVE PROGRESS)
      ===================================================================== */}
      {studyMode === 'practice' && (
        <section className="space-y-4">
          {isGeneratingQuiz && quizStreamCount === 0 ? (
            <div className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-10 text-center max-w-lg mx-auto space-y-3 transition-colors">
              <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-[#0D254C] dark:text-[#9CC0F9] uppercase tracking-wide">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span>Parallel Fast Generation</span>
              </div>
              <div className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
                Preparing {inFlightTargetSize}-Item{' '}
                {activeScopeSection ? `Section ${activeScopeSection.sectionLetter} ` : ''}Quiz...
              </div>
              <p className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                Generating in fast parallel sub-batches — Question #1 will appear in a few seconds so you can start answering right away.
              </p>
            </div>
          ) : practiceDisplayedQuestions.length === 0 ? (
            <div className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-12 text-center max-w-md mx-auto space-y-4 transition-colors">
              <div className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
                {activeScopeSection
                  ? `No Section ${activeScopeSection.sectionLetter} Quiz Questions Yet`
                  : `No ${activeQuizSize}-Item Quiz Loaded Yet`}
              </div>
              <p className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                {activeScopeSection
                  ? `Choose an item count and generate a fresh quiz strictly covering Section ${activeScopeSection.sectionLetter}: ${activeScopeSection.title}.`
                  : `Choose an item count to generate a fresh quiz or load the PRC starter questions.`}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <select
                  aria-label="Choose quiz item count"
                  value={activeQuizSize}
                  disabled={isGenerating}
                  onChange={(e) => setQuizSizeForScope(practiceScope, Number(e.target.value))}
                  className="px-3 py-2 bg-[#F8FAFC] dark:bg-[#1A2942] border border-slate-300 dark:border-[#293D5C] rounded-lg text-xs font-mono font-semibold text-[#0F172A] dark:text-[#E6ECF5] disabled:opacity-50 cursor-pointer"
                >
                  {QUIZ_ITEM_COUNT_OPTIONS.map((cnt) => (
                    <option key={cnt} value={cnt}>
                      {cnt} items
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleGeneratePracticeQuiz(practiceScope, activeQuizSize)}
                  className="px-4 py-2 bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
                >
                  {activeScopeSection
                    ? `Generate ${activeQuizSize}-Item Section ${activeScopeSection.sectionLetter} Quiz`
                    : `Generate ${activeQuizSize}-Item Quiz`}
                </button>
                {practiceScope === 'ALL' && (
                  <button
                    type="button"
                    onClick={() => onLoadOfficialTosBank('practice')}
                    className="px-4 py-2 bg-[#2D3136] dark:bg-[#1A2942] dark:border dark:border-[#293D5C] hover:bg-[#1E2226] dark:hover:bg-[#243858] text-white text-xs font-semibold rounded-lg"
                  >
                    Load PRC Starter
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* TOP QUIZ STATUS & QUICK SAVE BAR */}
              <div className="bg-[#EDF2FA]/80 dark:bg-[#172844] border border-[#0D254C]/15 dark:border-[#2B436B] rounded-xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2.5 sm:gap-3 text-xs transition-colors">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[#334155] dark:text-[#C5D2E3] tabular-nums">
                  <span className="font-semibold text-[#0D254C] dark:text-[#F8FAFC] font-sans">
                    {activeScopeSection
                      ? `Section ${activeScopeSection.sectionLetter}: ${activeScopeSection.title}`
                      : 'Full Subject Quiz'}
                  </span>
                  <span aria-hidden="true" className="text-slate-400 dark:text-slate-500">
                    ·
                  </span>
                  <span>
                    {quizEval.answeredCount}/
                    {isGeneratingQuiz ? inFlightTargetSize : quizEval.totalItems} Answered
                  </span>
                  {isGeneratingQuiz && practiceDisplayedQuestions.length < inFlightTargetSize && (
                    <>
                      <span aria-hidden="true" className="text-slate-400 dark:text-slate-500">
                        ·
                      </span>
                      <span className="text-[#8C4D11] dark:text-[#F2AE63] font-sans font-semibold">
                        {practiceDisplayedQuestions.length}/{inFlightTargetSize} loaded…
                      </span>
                    </>
                  )}
                  {quizEval.answeredCount > 0 && (
                    <>
                      <span
                        aria-hidden="true"
                        className="text-slate-400 dark:text-slate-500"
                      >
                        ·
                      </span>
                      <span className="text-[#143D3C] dark:text-[#68C7C5] font-semibold">
                        Score: {quizEval.correctCount}/{quizEval.answeredCount} (
                        {quizEval.accuracyPercent}%)
                      </span>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {!isGeneratingQuiz &&
                    practiceDisplayedQuestions.length > 0 &&
                    practiceDisplayedQuestions.length < activeQuizSize && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void handleGeneratePracticeQuiz(practiceScope, activeQuizSize, {
                              appendToCurrent: true,
                            })
                          }
                          className="min-h-[36px] sm:min-h-0 inline-flex items-center gap-1 px-3 py-1.5 sm:py-1 rounded-md border border-[#2E7978] text-[#2E7978] dark:text-[#68C7C5] dark:border-[#68C7C5] hover:bg-[#2E7978]/10 font-semibold transition-colors"
                        >
                          <span>
                            Generate {activeQuizSize - practiceDisplayedQuestions.length} more
                          </span>
                        </button>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                          ·
                        </span>
                      </>
                    )}
                  <button
                    type="button"
                    onClick={() =>
                      handleExplicitSaveQuizProgress(quizEval.isAllAnswered)
                    }
                    className="min-h-[36px] sm:min-h-0 inline-flex items-center gap-1 px-3 py-1.5 sm:py-1 rounded-md bg-[#2E7978] hover:bg-[#246160] text-white font-semibold transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>
                      {saveFeedback === 'saved' ? 'Saved ✓' : 'Save Progress'}
                    </span>
                  </button>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSaveFeedback('idle');
    setSaveNotice(null);
                      onUpdateSessionProgress((prev) => ({
                        ...prev,
                        practice: {
                          ...prev.practice,
                          draftChoices: {},
                          submittedAnswers: {},
                          completedAt: 0,
                          updatedAt: 0,
                        },
                      }));
                    }}
                    className="min-h-[36px] sm:min-h-0 text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white font-medium"
                  >
                    Reset Answers
                  </button>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSaveFeedback('idle');
    setSaveNotice(null);
                      const quizIds = new Set(
                        practiceDisplayedQuestions.map((q) => q.id)
                      );
                      // Also remove this quiz's saved answers and the goals it cleared, so daily progress,
                      // Subject Analysis and the GWA Calculator no longer count it.
                      onRemoveAttemptsForQuestions(Array.from(quizIds));
                      onUnmarkCompetencies(quizEval.clearedCompetencyIds);
                      onUpdateQuestions(questions.filter((q) => !quizIds.has(q.id)));
                      onUpdateSessionProgress((prev) => ({
                        ...prev,
                        practice: {
                          ...prev.practice,
                          draftChoices: {},
                          submittedAnswers: {},
                          activeQuestionIds: undefined,
                          completedAt: 0,
                          updatedAt: 0,
                        },
                      }));
                    }}
                    className="min-h-[36px] sm:min-h-0 text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 font-medium"
                  >
                    Clear Quiz
                  </button>
                </div>
              </div>

              {practiceDisplayedQuestions.map((q, idx) => {
                const draftChoice = draftPracticeChoices[q.id];
                const submittedAns = submittedPracticeAnswers[q.id];
                const isSubmitted = Boolean(submittedAns);
                const diffTier = getDifficultyFromBlooms(q.bloomsLevel);
                const optRationales = getQuestionOptionRationales(q);
                const adaptiveTip = submittedAns
                  ? getAdaptiveQuestionExamTip(q, submittedAns)
                  : null;

                return (
                  <div
                    key={q.id}
                    id={`quiz-item-${idx + 1}`}
                    className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-4 sm:p-6 space-y-4 scroll-mt-20 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-[#9FB0C7] font-mono">
                      <span className="font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
                        Item #{idx + 1} of{' '}
                        {isGeneratingQuiz
                          ? Math.max(inFlightTargetSize, practiceDisplayedQuestions.length)
                          : practiceDisplayedQuestions.length}
                      </span>
                      <div className="flex items-center gap-3">
                        <span
                          className={`font-semibold ${
                            diffTier === 'Easy'
                              ? 'text-[#0D254C] dark:text-[#9CC0F9]'
                              : diffTier === 'Moderate'
                              ? 'text-[#22605F] dark:text-[#68C7C5]'
                              : 'text-[#8C4D11] dark:text-[#F2AE63]'
                          }`}
                        >
                          {q.bloomsLevel} · {diffTier}
                        </span>
                        {isSubmitted && (
                          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-[#C5D2E3] font-sans font-medium">
                            <Lock className="w-3 h-3" />
                            <span>Locked [{submittedAns}]</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="font-sans text-sm sm:text-base font-medium text-[#0F172A] dark:text-[#E6ECF5] leading-relaxed">
                      {q.stem}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                        const isDraftSelected = draftChoice === optKey;
                        const isSubmittedPicked = submittedAns === optKey;
                        const isRight = q.correctChoice === optKey;

                        let btnStyle =
                          'bg-[#F8FAFC] dark:bg-[#1A2942]/80 hover:bg-[#ECEFF3] dark:hover:bg-[#1A2942] border-slate-200 dark:border-[#293D5C] text-[#0F172A] dark:text-[#E6ECF5] cursor-pointer';

                        if (isSubmitted) {
                          if (isRight) {
                            btnStyle =
                              'bg-[#EAF4F4] dark:bg-[#112A2D] border-[#2E7978] dark:border-[#2E7978] text-[#143D3C] dark:text-[#D5F2F1] font-semibold cursor-not-allowed';
                          } else if (isSubmittedPicked && !isRight) {
                            btnStyle =
                              'bg-rose-50 dark:bg-rose-950/55 border-rose-400 dark:border-rose-500/80 text-rose-900 dark:text-rose-100 cursor-not-allowed';
                          } else {
                            btnStyle =
                              'bg-slate-50/70 dark:bg-[#0B1320]/45 border-slate-200 dark:border-[#22324D] text-slate-500 dark:text-[#9FB0C7] cursor-not-allowed';
                          }
                        } else if (isDraftSelected) {
                          btnStyle =
                            'bg-[#EDF2FA] dark:bg-[#1A2D4A] border-[#0D254C] dark:border-[#9CC0F9] ring-1 ring-[#0D254C] dark:ring-[#9CC0F9] text-[#0D254C] dark:text-[#E6ECF5] font-semibold cursor-pointer';
                        }

                        return (
                          <button
                            key={optKey}
                            type="button"
                            disabled={isSubmitted}
                            onClick={() => handleSelectDraftPracticeChoice(q.id, optKey)}
                            className={`min-h-[44px] font-sans text-left px-3.5 sm:px-4 py-3 rounded-lg border text-xs sm:text-sm transition-colors flex items-start gap-2.5 ${btnStyle}`}
                          >
                            <span className="font-mono font-bold shrink-0">[{optKey}]</span>
                            <span>{q.options[optKey]}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* TWO-STEP SUBMIT BUTTON (LOCKS ANSWER ON CLICK) */}
                    {!isSubmitted && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pt-1">
                        <span className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                          {draftChoice ? `Selected [${draftChoice}]` : 'Select an option'}
                        </span>

                        <button
                          type="button"
                          disabled={!draftChoice}
                          onClick={() => handleSubmitPracticeAnswer(q)}
                          className={`w-full sm:w-auto min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                            draftChoice
                              ? 'bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] text-white cursor-pointer'
                              : 'bg-[#ECEFF3] dark:bg-[#1A2942]/70 border border-slate-200 dark:border-[#293D5C] text-slate-400 dark:text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {draftChoice ? `Submit Answer [${draftChoice}]` : 'Submit Answer'}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* CLEAN NON-DUPLICATE FEEDBACK (SHOWN ONLY AFTER SUBMIT) */}
                    {isSubmitted && submittedAns && adaptiveTip && (
                      <div className="pt-4 border-t border-slate-100 dark:border-[#22324D] text-xs leading-relaxed space-y-3.5">
                        <div className="flex items-center gap-2 font-semibold text-sm">
                          {submittedAns === q.correctChoice ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-[#2E7978] dark:text-[#68C7C5]" />
                              <span className="text-[#143D3C] dark:text-[#68C7C5]">
                                Correct · Key [{q.correctChoice}]
                              </span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                              <span className="text-rose-800 dark:text-rose-300">
                                Incorrect · You chose [{submittedAns}] · Key [{q.correctChoice}]
                              </span>
                            </>
                          )}
                        </div>

                        {/* ADAPTIVE BOARD EXAM TIP */}
                        <div
                          className={`p-3.5 rounded-lg border flex items-start gap-2.5 ${
                            adaptiveTip.variant === 'correct'
                              ? 'bg-[#EAF4F4] dark:bg-[#112A2D] border-[#2E7978]/50 dark:border-[#2E7978] text-[#143D3C] dark:text-[#D5F2F1]'
                              : 'bg-[#FDF3E7] dark:bg-[#2C1D10] border-[#D9822B]/70 dark:border-[#9A5B1E] text-[#3B2006] dark:text-[#F7DEC2]'
                          }`}
                        >
                          <Lightbulb
                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                              adaptiveTip.variant === 'correct'
                                ? 'text-[#22605F] dark:text-[#68C7C5]'
                                : 'text-[#8C4D11] dark:text-[#F2AE63]'
                            }`}
                          />
                          <div className="space-y-0.5">
                            <div className="font-semibold">{adaptiveTip.headline}</div>
                            <div>{adaptiveTip.body}</div>
                          </div>
                        </div>

                        {/* CLEAN 4-OPTION BREAKDOWN */}
                        <div className="divide-y divide-slate-100 dark:divide-[#22324D] border border-slate-200 dark:border-[#293D5C] rounded-lg overflow-hidden">
                          {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                            const isCorrectOpt = letter === q.correctChoice;
                            const isUserPick = letter === submittedAns;
                            return (
                              <div
                                key={letter}
                                className={`px-3.5 py-2.5 flex items-start gap-2.5 ${
                                  isCorrectOpt
                                    ? 'bg-[#EAF4F4]/60 dark:bg-[#112A2D]/65'
                                    : isUserPick
                                    ? 'bg-rose-50/40 dark:bg-rose-950/30'
                                    : 'bg-white dark:bg-[#131F33]'
                                }`}
                              >
                                <span
                                  className={`font-mono font-bold shrink-0 ${
                                    isCorrectOpt
                                      ? 'text-[#22605F] dark:text-[#68C7C5]'
                                      : isUserPick
                                      ? 'text-rose-700 dark:text-rose-400'
                                      : 'text-[#475569] dark:text-[#9FB0C7]'
                                  }`}
                                >
                                  [{letter}] {isCorrectOpt ? '✓' : '✗'}
                                </span>
                                <div>
                                  <span className="font-semibold text-[#0F172A] dark:text-[#E6ECF5]">
                                    {q.options[letter]}:{' '}
                                  </span>
                                  <span className="text-slate-600 dark:text-[#C5D2E3]">
                                    {optRationales[letter]}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* END-OF-QUIZ SAVE PROGRESS & SECTION GOALS COMPLETION FOOTER */}
              <div
                id="quiz-completion-card"
                className={`rounded-xl p-6 space-y-4 transition-colors ${
                  quizEval.isAllAnswered
                    ? 'bg-white dark:bg-[#131F33] border-2 border-[#0D254C] dark:border-[#9CC0F9]'
                    : 'bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-mono uppercase tracking-wide text-[#0D254C] dark:text-[#9CC0F9] font-semibold">
                      {quizEval.isAllAnswered
                        ? saveFeedback === 'saved' || sessionProgress.practice.completedAt
                          ? 'Quiz Completed · Progress Saved'
                          : 'Quiz Completed · Ready to Save'
                        : `Quiz In Progress (${quizEval.answeredCount} of ${quizEval.totalItems} Answered)`}
                    </div>
                    <h3 className="text-lg sm:text-xl font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
                      {quizEval.isAllAnswered
                        ? `Final Score: ${quizEval.correctCount} / ${quizEval.totalItems} (${quizEval.accuracyPercent}%)`
                        : `Current Score: ${quizEval.correctCount} / ${quizEval.answeredCount} (${quizEval.accuracyPercent}%)`}
                    </h3>
                    {quizEval.isAllAnswered && quizEval.clearedSections.length > 0 ? (
                      <p className="text-xs text-[#22605F] dark:text-[#68C7C5] font-medium flex items-center gap-1.5 pt-0.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          Section{' '}
                          {quizEval.clearedSections
                            .map((s) => `${s.sectionLetter} (${s.competencyIds.length} goals)`)
                            .join(', ')}{' '}
                          reached {COMPETENCY_MASTERY_THRESHOLD_PERCENT}%+ mastery — see percentages in Syllabus.
                        </span>
                      </p>
                    ) : quizEval.targetSection && !quizEval.isAllAnswered ? (
                      <p className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                        Finish all {quizEval.totalItems} items in this Section{' '}
                        {quizEval.targetSection.sectionLetter} quiz. A goal is cleared only with{' '}
                        {COMPETENCY_MASTERY_MIN_ITEMS}+ answers on it and {COMPETENCY_MASTERY_THRESHOLD_PERCENT}%+ mastery.
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                        Your submitted answers and analytics logs are synced—save below to finalize your session.
                      </p>
                    )}
                    {saveNotice && (
                      <p className="text-xs text-amber-700 dark:text-[#F2AE63] mt-1">{saveNotice}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={quizEval.answeredCount === 0 || saveFeedback === 'saving'}
                      onClick={() =>
                        handleExplicitSaveQuizProgress(
                          quizEval.isAllAnswered || Boolean(sessionProgress.practice.completedAt)
                        )
                      }
                      className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        saveFeedback === 'saved' || sessionProgress.practice.completedAt
                          ? 'bg-[#2E7978] hover:bg-[#246160] text-white'
                          : 'bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] disabled:opacity-50 text-white'
                      }`}
                    >
                      <Save className="w-4 h-4" />
                      <span>
                        {saveFeedback === 'saving'
                          ? 'Saving...'
                          : saveFeedback === 'saved' || sessionProgress.practice.completedAt
                          ? 'Progress Saved ✓'
                          : quizEval.isAllAnswered
                          ? 'Save Progress & Complete Quiz'
                          : 'Save Progress'}
                      </span>
                    </button>

                    {quizEval.answeredCount > 0 && !quizEval.isAllAnswered && (
                      <button
                        type="button"
                        onClick={() => handleExplicitSaveQuizProgress(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-[#ECEFF3] dark:bg-[#1A2942] hover:bg-slate-200 dark:hover:bg-[#243858] text-[#0F172A] dark:text-[#E6ECF5] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                      >
                        <span>Finish Early &amp; Save</span>
                      </button>
                    )}
                  </div>
                </div>

                {quizEval.isAllAnswered && (
                  <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100 dark:border-[#22324D]">
                    <button
                      type="button"
                      onClick={() => setStudyMode('tos')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#ECEFF3] dark:bg-[#1A2942] hover:bg-slate-200 dark:hover:bg-[#243858] text-[#0F172A] dark:text-[#E6ECF5] text-xs font-semibold rounded-lg transition-colors"
                    >
                      <CheckSquare className="w-3.5 h-3.5 text-[#2E7978] dark:text-[#68C7C5]" />
                      <span>View Syllabus Goals</span>
                    </button>

                    <select
                      aria-label="Choose next quiz item count"
                      value={activeQuizSize}
                      disabled={isGenerating}
                      onChange={(e) => setQuizSizeForScope(practiceScope, Number(e.target.value))}
                      className="px-3 py-2 bg-[#ECEFF3] dark:bg-[#1A2942] border border-slate-300 dark:border-[#293D5C] rounded-lg text-xs font-mono font-semibold text-[#0F172A] dark:text-[#E6ECF5] disabled:opacity-50 cursor-pointer"
                    >
                      {QUIZ_ITEM_COUNT_OPTIONS.map((cnt) => (
                        <option key={cnt} value={cnt}>
                          {cnt} items
                        </option>
                      ))}
                    </select>

                    {practiceDisplayedQuestions.length > 0 &&
                      practiceDisplayedQuestions.length < activeQuizSize && (
                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={() =>
                            void handleGeneratePracticeQuiz(practiceScope, activeQuizSize, {
                              appendToCurrent: true,
                            })
                          }
                          className="inline-flex items-center px-3.5 py-2 border border-[#2E7978] dark:border-[#68C7C5] text-[#2E7978] dark:text-[#68C7C5] hover:bg-[#2E7978]/10 disabled:opacity-50 text-xs font-semibold rounded-lg transition-colors"
                        >
                          <span>
                            Generate {activeQuizSize - practiceDisplayedQuestions.length} more
                            (keep these {practiceDisplayedQuestions.length})
                          </span>
                        </button>
                      )}

                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleGeneratePracticeQuiz(practiceScope, activeQuizSize)}
                      className="inline-flex items-center px-3.5 py-2 bg-[#ECEFF3] dark:bg-[#1A2942] hover:bg-slate-200 dark:hover:bg-[#243858] disabled:opacity-50 text-[#0F172A] dark:text-[#E6ECF5] text-xs font-semibold rounded-lg transition-colors"
                    >
                      <span>Generate Fresh {activeQuizSize}-Item Quiz</span>
                    </button>

                    <button
                      type="button"
                      onClick={onNavigateToAnalytics}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#ECEFF3] dark:bg-[#1A2942] hover:bg-slate-200 dark:hover:bg-[#243858] text-[#0F172A] dark:text-[#E6ECF5] text-xs font-semibold rounded-lg transition-colors"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-[#0D254C] dark:text-[#9CC0F9]" />
                      <span>View Performance Analytics</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* =====================================================================
          MODE 4: 100-ITEM, 3-HOUR BLEPP MOCK BOARD EXAM & 150-ITEM PRC SHADING SHEET
      ===================================================================== */}
      {studyMode === 'mock' && (
        <section className="space-y-5 sm:space-y-6">
          {/* MOCK EXAM CONTROL & TIMER HEADER */}
          <div className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-4 sm:p-5 space-y-3.5 sm:space-y-4 no-print transition-colors">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4">
              <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 sm:gap-4">
                <div className="flex items-center gap-2">
                  <Clock
                    className={`w-5 h-5 ${
                      examSecondsLeft <= 300
                        ? 'text-rose-600 dark:text-rose-400'
                        : examSecondsLeft <= 1800
                        ? 'text-[#8C4D11] dark:text-[#F2AE63]'
                        : 'text-[#0D254C] dark:text-[#9CC0F9]'
                    }`}
                  />
                  <div>
                    <div className="text-[11px] font-medium text-slate-500 dark:text-[#9FB0C7]">
                      3-Hour Official PRC Timer ({subjectMockSize} Items)
                    </div>
                    <div
                      className={`font-mono text-lg sm:text-xl font-bold tabular-nums ${
                        examSecondsLeft <= 300
                          ? 'text-rose-700 dark:text-rose-400'
                          : examSecondsLeft <= 1800
                          ? 'text-[#8C4D11] dark:text-[#F2AE63]'
                          : 'text-[#0D254C] dark:text-[#E6ECF5]'
                      }`}
                    >
                      {formatExamTimer(examSecondsLeft)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (isExamTimerRunning) {
                        setIsExamTimerRunning(false);
                        onUpdateSessionProgress((prev) => ({
                          ...prev,
                          mock: {
                            ...prev.mock,
                            examSecondsLeft: examSecondsRef.current,
                            updatedAt: Date.now(),
                          },
                        }));
                      } else {
                        setIsExamTimerRunning(true);
                        onUpdateSessionProgress((prev) => ({
                          ...prev,
                          mock: {
                            ...prev.mock,
                            examSecondsLeft: examSecondsRef.current,
                            updatedAt: Date.now(),
                          },
                        }));
                      }
                    }}
                    className={`min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      isExamTimerRunning
                        ? 'bg-[#D9822B] text-[#1C1208] hover:bg-[#C57320]'
                        : 'bg-[#0D254C] dark:bg-[#234B82] text-white hover:bg-[#163567] dark:hover:bg-[#2C5B9C]'
                    }`}
                  >
                    {isExamTimerRunning ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>{isExamTimerRunning ? 'Pause' : 'Start 3-Hr'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsExamTimerRunning(false);
                      setExamSecondsLeft(fullMockSeconds);
                      onUpdateSessionProgress((prev) => ({
                        ...prev,
                        mock: {
                          ...prev.mock,
                          examSecondsLeft: fullMockSeconds,
                        },
                      }));
                    }}
                    className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0F172A] dark:text-[#E6ECF5] bg-[#ECEFF3] dark:bg-[#1A2942] hover:bg-slate-200 dark:hover:bg-[#243858] rounded-md"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                </div>

                {examSecondsLeft <= 1800 && (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3B2006] dark:text-[#F7DEC2] bg-[#FDF3E7] dark:bg-[#2C1D10] border border-[#D9822B] dark:border-[#9A5B1E] px-3 py-1 rounded">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>
                      {examSecondsLeft <= 300
                        ? 'FINAL 5 MINUTES!'
                        : '30-Minute Warning'}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
                {/* MOBILE PROMINENT TABBED TOGGLE: QUESTIONS vs. ANSWER SHEET (<1024px) */}
                <div
                  role="tablist"
                  aria-label="Toggle between Mock Questions and PRC Answer Sheet"
                  className="lg:hidden grid grid-cols-2 gap-1 p-1 bg-[#ECEFF3] dark:bg-[#0B1320] rounded-lg border border-slate-200 dark:border-[#22324D]"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mobileMockTab === 'questions'}
                    onClick={() => setMobileMockTab('questions')}
                    className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      mobileMockTab === 'questions'
                        ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] shadow-xs'
                        : 'text-slate-600 dark:text-[#9FB0C7]'
                    }`}
                  >
                    Questions ({mockDisplayedQuestions.length || subjectMockSize})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mobileMockTab === 'sheet'}
                    onClick={() => setMobileMockTab('sheet')}
                    className={`min-h-[40px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      mobileMockTab === 'sheet'
                        ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#9CC0F9] shadow-xs'
                        : 'text-slate-600 dark:text-[#9FB0C7]'
                    }`}
                  >
                    Answer Sheet ({shadedActiveMockCount}/{activeMockItemLimit})
                  </button>
                </div>

                {/* DESKTOP VIEW SWITCHER (>=1024px) */}
                <div className="hidden lg:flex items-center gap-1 p-1 bg-[#ECEFF3] dark:bg-[#0B1320] rounded-lg border border-slate-200 dark:border-[#22324D]">
                  <button
                    type="button"
                    onClick={() => setMockViewLayout('split')}
                    className={`px-3 py-1 text-xs font-medium rounded ${
                      mockViewLayout === 'split'
                        ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] shadow-xs'
                        : 'text-slate-600 dark:text-[#9FB0C7]'
                    }`}
                  >
                    Question Booklet ({mockDisplayedQuestions.length}/{subjectMockSize})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMockViewLayout('full_prc_sheet')}
                    className={`px-3 py-1 text-xs font-medium rounded ${
                      mockViewLayout === 'full_prc_sheet'
                        ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#9CC0F9] shadow-xs'
                        : 'text-slate-600 dark:text-[#9FB0C7]'
                    }`}
                  >
                    150-Item (6×25) PRC Sheet
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPrintModalInitialTab('prc_sheet');
                      setIsPrintModalOpen(true);
                    }}
                    className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 bg-white dark:bg-[#1A2942] hover:bg-slate-50 dark:hover:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] border border-slate-300 dark:border-[#293D5C] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Printer className="w-4 h-4 text-[#0D254C] dark:text-[#9CC0F9] shrink-0" />
                    <span>Print Packet</span>
                  </button>

                  <label className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors whitespace-nowrap">
                    <Upload className="w-4 h-4 shrink-0" />
                    <span>Upload Sheet</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPendingOmrPhotoFile(file);
                          setIsOmrModalOpen(true);
                        }
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsOmrModalOpen(true)}
                    className="col-span-2 sm:col-span-1 min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 bg-[#2D3136] dark:bg-[#243858] hover:bg-[#1E2226] dark:hover:bg-[#2E466D] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Camera className="w-4 h-4 shrink-0" />
                    <span>OMR Scanner</span>
                  </button>

                  {!mockSubmitted ? (
                    <button
                      type="button"
                      disabled={mockDisplayedQuestions.length === 0}
                      onClick={handleSubmitMockExam}
                      className="col-span-2 sm:col-span-1 min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#2E7978] hover:bg-[#246160] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Submit &amp; Save Exam</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setExamSecondsLeft(fullMockSeconds);
                        onUpdateSessionProgress((prev) => ({
                          ...prev,
                          mock: {
                            ...prev.mock,
                            mockSubmitted: false,
                            shadedMap: {},
                            flaggedItems: {},
                            examSecondsLeft: fullMockSeconds,
                            updatedAt: 0,
                          },
                        }));
                      }}
                      className="col-span-2 sm:col-span-1 min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#2D3136] dark:bg-[#243858] hover:bg-[#1E2226] dark:hover:bg-[#2E466D] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-4 h-4 shrink-0" />
                      <span>Clear &amp; Retake</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {mockSubmitted && mockDisplayedQuestions.length > 0 && (
            <div className="bg-white dark:bg-[#131F33] border-2 border-[#0D254C] dark:border-[#9CC0F9] rounded-xl p-4 sm:p-6 space-y-4 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-[#22324D] pb-4">
                <div>
                  <div className="text-xs font-mono text-[#0D254C] dark:text-[#9CC0F9] font-semibold uppercase">
                    BLEPP Mock Exam Score Report · Synced to GWA &amp; Analytics
                  </div>
                  <h3 className="text-lg sm:text-xl font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5] mt-0.5">
                    {subject.fullTitle} — {mockGradeResult.correctCount} /{' '}
                    {mockGradeResult.totalExamItems} ({mockGradeResult.percentage}%)
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs tabular-nums">
                <div className="p-3 bg-[#EAF4F4] dark:bg-[#112A2D] border border-[#2E7978]/50 dark:border-[#2E7978] rounded-lg">
                  <div className="text-[#143D3C] dark:text-[#68C7C5]">Correct Shaded</div>
                  <div className="font-mono text-lg font-bold text-[#143D3C] dark:text-[#D5F2F1]">
                    {mockGradeResult.correctCount}
                  </div>
                </div>
                <div className="p-3 bg-rose-50/60 dark:bg-rose-950/45 border border-rose-200 dark:border-rose-700/70 rounded-lg">
                  <div className="text-rose-800 dark:text-rose-300">Incorrect Shaded</div>
                  <div className="font-mono text-lg font-bold text-rose-950 dark:text-rose-100">
                    {mockGradeResult.incorrectCount}
                  </div>
                </div>
                <div className="p-3 bg-[#F8FAFC] dark:bg-[#1A2942] border border-slate-200 dark:border-[#293D5C] rounded-lg">
                  <div className="text-slate-600 dark:text-[#9FB0C7]">Unshaded / Blank</div>
                  <div className="font-mono text-lg font-bold text-[#0F172A] dark:text-[#E6ECF5]">
                    {mockGradeResult.blankCount}
                  </div>
                </div>
                <div className="p-3 bg-[#FDF3E7] dark:bg-[#2C1D10] border border-[#D9822B]/70 dark:border-[#9A5B1E] rounded-lg">
                  <div className="text-[#3B2006] dark:text-[#F2AE63]">Multiple / Invalid</div>
                  <div className="font-mono text-lg font-bold text-[#3B2006] dark:text-[#F7DEC2]">
                    {mockGradeResult.invalidOrMultipleCount}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FULL / MOBILE PRC ANSWER SHEET PANE */}
          <div
            className={`${mobileMockTab === 'sheet' ? 'block' : 'hidden'} ${
              mockViewLayout === 'full_prc_sheet' ? 'lg:block' : 'lg:hidden'
            }`}
          >
            <PrcAnswerSheet150
              subjectTitle={subject.fullTitle}
              examineeName={examineeName}
              onExamineeNameChange={setExamineeName}
              questionSet={questionSet}
              onQuestionSetChange={setQuestionSet}
              activeItemCount={activeMockItemLimit}
              shadedMap={mockShadedMap}
              onToggleChoice={handleTogglePrcSheetChoice}
              readOnly={mockSubmitted}
              showAnswerKeyOverlay={mockSubmitted}
              answerKeyMap={answerKeyMap}
            />
          </div>

          {/* QUESTION BOOKLET / DESKTOP SPLIT PANE */}
          <div
            className={`${mobileMockTab === 'questions' ? 'block' : 'hidden'} ${
              mockViewLayout !== 'full_prc_sheet' ? 'lg:block' : 'lg:hidden'
            }`}
          >
            {mockDisplayedQuestions.length === 0 ? (
              <div className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-6 sm:p-12 text-center max-w-md mx-auto space-y-4 transition-colors">
                <div className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
                  No {subjectMockSize}-Item Mock Exam Loaded Yet
                </div>
                <p className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                  Generate a full {subjectMockSize}-item proportional BLEPP Mock Exam (with 3-hour timer) or practice on the 150-item PRC shading sheet.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={handleGenerateMockExam100}
                    className="min-h-[40px] px-4 py-2 bg-[#2E7978] hover:bg-[#246160] disabled:opacity-50 text-white text-xs font-semibold rounded-lg"
                  >
                    Generate {subjectMockSize}-Item Mock Exam
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMockTab('sheet');
                      setMockViewLayout('full_prc_sheet');
                    }}
                    className="min-h-[40px] px-4 py-2 bg-[#ECEFF3] dark:bg-[#1A2942] hover:bg-slate-200 dark:hover:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] text-xs font-semibold rounded-lg"
                  >
                    Open 150-Item PRC Sheet ({subjectMockSize} Active)
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7 space-y-4">
                  {mockDisplayedQuestions.map((q, idx) => {
                    const itemNum = idx + 1;
                    const userShaded = mockShadedMap[itemNum] || 'BLANK';
                    const isFlagged = Boolean(flaggedItems[itemNum]);
                    const diffTier = getDifficultyFromBlooms(q.bloomsLevel);
                    const optRationales = getQuestionOptionRationales(q);
                    const mockAdaptiveTip = mockSubmitted
                      ? getAdaptiveQuestionExamTip(q, userShaded)
                      : null;

                    return (
                      <div
                        key={q.id}
                        id={`mock-item-${itemNum}`}
                        className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-4 sm:p-5 space-y-3 scroll-mt-20 transition-colors"
                      >
                        <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-[#9FB0C7]">
                          <span>
                            <strong className="text-[#0D254C] dark:text-[#E6ECF5]">
                              Item #{itemNum}
                            </strong>{' '}
                            · {q.bloomsLevel} ({diffTier})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSessionProgress((prev) => ({
                                ...prev,
                                mock: {
                                  ...prev.mock,
                                  examSecondsLeft: examSecondsRef.current,
                                  flaggedItems: {
                                    ...prev.mock.flaggedItems,
                                    [itemNum]: !prev.mock.flaggedItems[itemNum],
                                  },
                                  updatedAt: Date.now(),
                                },
                              }))
                            }
                            className={`min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-label font-medium ${
                              isFlagged
                                ? 'bg-[#FDF3E7] dark:bg-[#2C1D10] text-[#3B2006] dark:text-[#F2AE63] border border-[#D9822B]/60'
                                : 'text-slate-500 dark:text-[#9FB0C7] hover:bg-slate-100 dark:hover:bg-[#1A2942]'
                            }`}
                          >
                            <Flag className="w-3 h-3" />
                            <span>{isFlagged ? 'Flagged' : 'Flag'}</span>
                          </button>
                        </div>

                        <p className="font-sans text-sm font-medium text-[#0F172A] dark:text-[#E6ECF5] leading-relaxed">
                          {q.stem}
                        </p>

                        <div className="space-y-2 pt-1">
                          {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                            const isSelected = userShaded === letter;
                            return (
                              <button
                                key={letter}
                                type="button"
                                disabled={mockSubmitted}
                                onClick={() => handleTogglePrcSheetChoice(itemNum, letter)}
                                className={`min-h-[44px] sm:min-h-0 font-sans w-full text-left px-3.5 py-2.5 sm:py-2 rounded-lg border text-xs flex items-start gap-2.5 transition-colors ${
                                  isSelected
                                    ? 'bg-[#0D254C] dark:bg-[#9CC0F9] text-white dark:text-[#0B1320] border-[#0D254C] dark:border-[#9CC0F9] font-semibold'
                                    : 'bg-[#F8FAFC] dark:bg-[#1A2942]/80 hover:bg-[#ECEFF3] dark:hover:bg-[#1A2942] text-[#0F172A] dark:text-[#E6ECF5] border-slate-200 dark:border-[#293D5C]'
                                } ${mockSubmitted ? 'cursor-not-allowed' : ''}`}
                              >
                                <span className="font-mono font-bold shrink-0">
                                  {isSelected ? '█' : `[${letter}]`}
                                </span>
                                <span>{q.options[letter]}</span>
                              </button>
                            );
                          })}
                        </div>

                        {mockSubmitted && mockAdaptiveTip && (
                          <div className="pt-3 border-t border-slate-100 dark:border-[#22324D] text-xs space-y-3">
                            <div className="font-mono font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
                              Marked [{userShaded}] · Key [{q.correctChoice}]
                            </div>
                            <div
                              className={`p-3 rounded-lg border space-y-0.5 ${
                                mockAdaptiveTip.variant === 'correct'
                                  ? 'bg-[#EAF4F4] dark:bg-[#112A2D] border-[#2E7978]/50 dark:border-[#2E7978] text-[#143D3C] dark:text-[#D5F2F1]'
                                  : 'bg-[#FDF3E7] dark:bg-[#2C1D10] border-[#D9822B]/70 dark:border-[#9A5B1E] text-[#3B2006] dark:text-[#F7DEC2]'
                              }`}
                            >
                              <div className="font-semibold">{mockAdaptiveTip.headline}</div>
                              <div>{mockAdaptiveTip.body}</div>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-[#22324D] border border-slate-200 dark:border-[#293D5C] rounded-lg overflow-hidden">
                              {(['A', 'B', 'C', 'D'] as const).map((letter) => (
                                <div
                                  key={letter}
                                  className={`px-3 py-2 ${
                                    letter === q.correctChoice
                                      ? 'bg-[#EAF4F4]/60 dark:bg-[#112A2D]/70 text-[#143D3C] dark:text-[#D5F2F1]'
                                      : 'bg-white dark:bg-[#131F33] text-slate-600 dark:text-[#C5D2E3]'
                                  }`}
                                >
                                  <strong className="font-mono text-[#0F172A] dark:text-[#E6ECF5]">
                                    [{letter}] {letter === q.correctChoice ? '✓' : '✗'}:
                                  </strong>{' '}
                                  {optRationales[letter]}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* DESKTOP SIDE-BY-SIDE OMR SHADING GRID (MOBILE USES DEDICATED ANSWER SHEET TAB) */}
                <div className="hidden lg:block lg:col-span-5 bg-white dark:bg-[#131F33] border-2 border-[#0D254C] dark:border-[#9CC0F9]/60 rounded-xl p-4 space-y-4 sticky top-4 transition-colors">
                  <div className="bg-[#0D254C] dark:bg-[#1A2D4A] text-white px-3 py-2 rounded flex items-center justify-between border border-transparent dark:border-[#293D5C]">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[#C5D8F8] dark:text-[#9CC0F9]">
                        PRC OMR Shading Grid ({subjectMockSize}-Item Mock)
                      </div>
                      <div className="text-xs font-label font-bold">
                        EXAMINATION ANSWER SHEET (SET {questionSet})
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMockViewLayout('full_prc_sheet')}
                      className="px-2.5 py-1 bg-white dark:bg-[#9CC0F9] text-[#0D254C] dark:text-[#0B1320] text-[11px] font-bold rounded hover:bg-[#EDF2FA] dark:hover:bg-[#B4D0FA] whitespace-nowrap"
                    >
                      Full 150-Item Form
                    </button>
                  </div>

                  <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-100 dark:divide-[#22324D] pr-1">
                    {mockDisplayedQuestions.map((q, idx) => {
                      const itemNum = idx + 1;
                      const userChoice = mockShadedMap[itemNum] || 'BLANK';

                      return (
                        <div
                          key={q.id}
                          className="flex items-center justify-between py-1.5 px-2 text-xs hover:bg-[#EDF2FA]/50 dark:hover:bg-[#1A2942]"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[#0D254C] dark:text-[#9CC0F9] w-7 text-right tabular-nums">
                              {itemNum}.
                            </span>
                            {flaggedItems[itemNum] && (
                              <span className="text-[10px] text-[#8C4D11] dark:text-[#F2AE63] font-semibold">
                                ▲ Flag
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {(['A', 'B', 'C', 'D', 'E'] as const).map((letter) => {
                              const isShaded = userChoice === letter;
                              return (
                                <button
                                  key={letter}
                                  type="button"
                                  disabled={mockSubmitted}
                                  onClick={() => handleTogglePrcSheetChoice(itemNum, letter)}
                                  aria-label={`Quick shade item ${itemNum} choice ${letter}`}
                                  className={`w-6 h-5 border font-mono text-[10px] flex items-center justify-center rounded-[2px] ${
                                    isShaded
                                      ? 'bg-[#0D254C] dark:bg-[#9CC0F9] text-white dark:text-[#0B1320] border-[#0D254C] dark:border-[#9CC0F9] font-bold'
                                      : 'bg-white dark:bg-[#0B1320] text-[#0D254C] dark:text-[#9CC0F9] border-[#0D254C]/80 dark:border-[#293D5C] hover:bg-[#EDF2FA] dark:hover:bg-[#1A2942]'
                                  }`}
                                >
                                  {isShaded ? '█' : `[${letter}]`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* PRINTABLE EXAM PACKET MODAL */}
      <PrintPacketModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        subjectTitle={subject.fullTitle}
        weightPercent={subject.weightPercent}
        scopeTitle={resolveScopeDescription('ALL').title}
        questions={mockDisplayedQuestions}
        defaultItemCount={subjectMockSize}
        shadedMap={mockShadedMap}
        initialTab={printModalInitialTab}
      />

      {/* AI PHOTO ANSWER SHEET OMR SCANNER MODAL */}
      <OmrScannerModal
        isOpen={isOmrModalOpen}
        onClose={() => setIsOmrModalOpen(false)}
        subjectTitle={subject.fullTitle}
        keyItems={
          keyItems.length > 0
            ? keyItems
            : Array.from({ length: subjectMockSize }, (_, idx) => ({
                itemNumber: idx + 1,
                correctChoice: 'A' as const,
                sectionCode: 'A',
                bloomsLevel: 'Applying' as const,
              }))
        }
        onApplyScannedSheet={handleApplyScannedOmr}
        initialPhotoFile={pendingOmrPhotoFile}
        onInitialPhotoProcessed={() => setPendingOmrPhotoFile(null)}
      />

      {/* OFFICIAL PRC TABLE OF SPECIFICATIONS (FEB 2023 ANNEX "B") PDF MODAL */}
      {isOfficialTosPdfOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="official-prc-tos-pdf-title"
          className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-2 sm:p-4"
        >
          <div className="bg-white dark:bg-[#131F33] border border-slate-200 dark:border-[#22324D] rounded-xl max-w-5xl w-full h-[88dvh] flex flex-col shadow-xl overflow-hidden">
            <div className="flex items-start sm:items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-3.5 bg-[#F8FAFC] dark:bg-[#1A2942] border-b border-slate-200 dark:border-[#22324D]">
              <div>
                <h2
                  id="official-prc-tos-pdf-title"
                  className="text-sm sm:text-base font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5]"
                >
                  Official PRC Table of Specifications — {subject.fullTitle} (
                  {subject.officialPdfPageRange})
                </h2>
                <p className="text-xs text-slate-600 dark:text-[#9FB0C7] font-mono">
                  {subject.officialTosSubjectHeader}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOfficialTosPdfOpen(false)}
                aria-label="Close Official PRC TOS PDF Viewer"
                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-slate-500 dark:text-[#9FB0C7] hover:text-[#0F172A] dark:hover:text-white rounded-lg shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <iframe
              title={`Official PRC Table of Specifications — ${subject.fullTitle}`}
              src={`${OFFICIAL_PRC_TOS_PDF_PATH}#page=${subject.officialPdfStartPage}`}
              className="w-full flex-1 border-0 bg-slate-100 dark:bg-[#0B1320]"
            />
          </div>
        </div>
      )}
    </div>
  );
};

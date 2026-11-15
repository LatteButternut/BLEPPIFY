/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut, Moon, Sun } from 'lucide-react';
import { PRC_TOS_SUBJECTS } from './data/tosData';
import {
  createEmptySubjectSession,
  DEFAULT_DAILY_QUESTION_GOAL,
  DEFAULT_TOPNOTCHER_TARGET_PERCENT,
  extractProfileInitials,
  findResumableSessions,
  FLASHCARD_DECK_SIZE,
  MOCK_EXAM_DURATION_MINUTES,
  normalizeDailyQuestionGoal,
  normalizeTopnotcherThreshold,
  QuestionAttemptLog,
  ResumableSessionInfo,
  SubjectId,
  SubjectSessionProgress,
} from './utils/bleppLogic';
import {
  CloudAppState,
  deleteCloudAccountAndData,
  loadCloudAppState,
  purgeLegacyProgressOnce,
  saveCloudAppState,
} from './utils/cloudStorage';
import {
  getLocalFallbackSession,
  initSupabaseRuntimeConfig,
  isSupabaseConfigured,
  LocalFallbackUser,
  signOutLocalFallback,
  supabase,
} from './supabaseClient';
import { SupabaseAuthScreen } from './components/SupabaseAuthScreen';
import { ExamDateSetupScreen } from './components/ExamDateSetupScreen';
import { PomodoroBar } from './components/PomodoroBar';
import { OverviewDashboard } from './components/OverviewDashboard';
import { SubjectWorkspace, UploadedPdfFile } from './components/SubjectWorkspace';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import {
  ProfileSettingsUpdatePayload,
  ProfileSettingsView,
} from './components/ProfileSettingsView';
import { ContinueSessionBar } from './components/ContinueSessionBar';
import { MobileBottomNav } from './components/MobileBottomNav';

const STORAGE_KEY_PREFIX = 'bleppify_state_v2';

function getScopedLocalStorageKey(userId?: string | null): string {
  return userId ? `${STORAGE_KEY_PREFIX}_${userId}` : `${STORAGE_KEY_PREFIX}_local`;
}

function normalizeSessionsBySubject(
  raw?: Partial<Record<SubjectId, Partial<SubjectSessionProgress>>>
): Record<SubjectId, SubjectSessionProgress> {
  const ids: SubjectId[] = [
    'dev_psych',
    'psych_assessment',
    'abnormal_psych',
    'io_psych',
  ];
  const out = {} as Record<SubjectId, SubjectSessionProgress>;
  for (const id of ids) {
    const empty = createEmptySubjectSession(MOCK_EXAM_DURATION_MINUTES);
    const incoming = raw?.[id];
    out[id] = {
      practice: {
        ...empty.practice,
        ...(incoming?.practice || {}),
        draftChoices: { ...(incoming?.practice?.draftChoices || {}) },
        submittedAnswers: { ...(incoming?.practice?.submittedAnswers || {}) },
        activeQuestionIds: Array.isArray(incoming?.practice?.activeQuestionIds)
          ? [...incoming!.practice!.activeQuestionIds!]
          : undefined,
      },
      mock: {
        ...empty.mock,
        ...(incoming?.mock || {}),
        shadedMap: { ...(incoming?.mock?.shadedMap || {}) },
        flaggedItems: { ...(incoming?.mock?.flaggedItems || {}) },
        activeQuestionIds: Array.isArray(incoming?.mock?.activeQuestionIds)
          ? [...incoming!.mock!.activeQuestionIds!]
          : undefined,
      },
    };
  }
  return out;
}

const DEFAULT_SEEN_MAP: Record<SubjectId, string[]> = {
  dev_psych: [],
  psych_assessment: [],
  abnormal_psych: [],
  io_psych: [],
};

function createDefaultCloudState(theme: 'light' | 'dark' = 'light'): CloudAppState {
  return {
    theme,
    examDate: null,
    profileName: '',
    profileAvatar: null,
    dailyQuestionGoal: DEFAULT_DAILY_QUESTION_GOAL,
    topnotcherMode: false,
    topnotcherThreshold: DEFAULT_TOPNOTCHER_TARGET_PERCENT,
    grades: {
      dev_psych: 0,
      psych_assessment: 0,
      abnormal_psych: 0,
      io_psych: 0,
    },
    masteredCompetencies: {},
    pomodoroCompletedToday: 0,
    flashcardsBySubject: {
      dev_psych: [],
      psych_assessment: [],
      abnormal_psych: [],
      io_psych: [],
    },
    questionsBySubject: {
      dev_psych: [],
      psych_assessment: [],
      abnormal_psych: [],
      io_psych: [],
    },
    pdfsBySubject: {
      dev_psych: [],
      psych_assessment: [],
      abnormal_psych: [],
      io_psych: [],
    },
    sessionsBySubject: normalizeSessionsBySubject(),
    seenStemsBySubject: { ...DEFAULT_SEEN_MAP },
    seenTermsBySubject: { ...DEFAULT_SEEN_MAP },
    attemptLogs: [],
    updatedAt: 0,
  };
}

function hydrateNormalizedState(
  raw: Partial<CloudAppState> | null | undefined,
  fallbackTheme: 'light' | 'dark' = 'light'
): CloudAppState {
  const base = createDefaultCloudState(fallbackTheme);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    theme:
      raw.theme === 'dark' || (raw.theme === undefined && fallbackTheme === 'dark')
        ? 'dark'
        : 'light',
    examDate:
      typeof raw.examDate === 'string' && raw.examDate.trim()
        ? raw.examDate.trim()
        : null,
    profileName: typeof raw.profileName === 'string' ? raw.profileName : '',
    profileAvatar:
      typeof raw.profileAvatar === 'string' && raw.profileAvatar.trim()
        ? raw.profileAvatar
        : null,
    dailyQuestionGoal: normalizeDailyQuestionGoal(
      raw.dailyQuestionGoal,
      DEFAULT_DAILY_QUESTION_GOAL
    ),
    topnotcherMode: Boolean(raw.topnotcherMode),
    topnotcherThreshold: normalizeTopnotcherThreshold(
      raw.topnotcherThreshold,
      DEFAULT_TOPNOTCHER_TARGET_PERCENT
    ),
    grades: { ...base.grades, ...(raw.grades || {}) },
    masteredCompetencies: { ...(raw.masteredCompetencies || {}) },
    flashcardsBySubject: {
      ...base.flashcardsBySubject,
      ...(raw.flashcardsBySubject || {}),
    },
    questionsBySubject: {
      ...base.questionsBySubject,
      ...(raw.questionsBySubject || {}),
    },
    pdfsBySubject: {
      ...base.pdfsBySubject,
      ...(raw.pdfsBySubject || {}),
    },
    sessionsBySubject: normalizeSessionsBySubject(raw.sessionsBySubject),
    seenStemsBySubject: {
      ...DEFAULT_SEEN_MAP,
      ...(raw.seenStemsBySubject || {}),
    },
    seenTermsBySubject: {
      ...DEFAULT_SEEN_MAP,
      ...(raw.seenTermsBySubject || {}),
    },
    attemptLogs: Array.isArray(raw.attemptLogs) ? raw.attemptLogs : [],
  };
}

export default function App() {
  // Purge legacy pre-BLEPPIFY local storage & IndexedDB progress on boot
  useEffect(() => {
    purgeLegacyProgressOnce();
  }, []);

  // Supabase Auth Session State (+ seamless local fallback session when Supabase keys are not yet configured)
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [session, setSession] = useState<Session | null>(null);
  const [localUser, setLocalUser] = useState<LocalFallbackUser | null>(() =>
    getLocalFallbackSession()
  );

  const activeUserId = session?.user?.id || localUser?.id || null;
  const activeUserEmail = session?.user?.email || localUser?.email || null;
  const isAuthenticated = Boolean(session?.user || localUser);

  const [activeTab, setActiveTab] = useState<
    'overview' | 'analytics' | 'profile' | SubjectId
  >('overview');
  const [initialStudyMode, setInitialStudyMode] = useState<
    'tos' | 'flashcards' | 'practice' | 'mock'
  >('tos');
  const [scopeRequest, setScopeRequest] = useState<{
    scopeKey: string;
    nonce: number;
  }>({ scopeKey: 'ALL', nonce: 0 });
  const [resumeScroll, setResumeScroll] = useState<{
    itemNumber: number | null;
    nonce: number;
  }>({ itemNumber: null, nonce: 0 });
  const [dismissedSessionTimestamps, setDismissedSessionTimestamps] = useState<
    Record<string, number>
  >({});
  const [lastVisitedSubjectId, setLastVisitedSubjectId] =
    useState<SubjectId>('psych_assessment');
  const [isMobileSubjectSheetOpen, setIsMobileSubjectSheetOpen] =
    useState<boolean>(false);
  const [isPasswordRecoveryActive, setIsPasswordRecoveryActive] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('reset_password') === '1'
  );

  const [cloudState, setCloudState] = useState<CloudAppState>(() =>
    createDefaultCloudState('light')
  );

  const [isCloudHydrated, setIsCloudHydrated] = useState<boolean>(false);
  const [headerAvatarError, setHeaderAvatarError] = useState<boolean>(false);
  const isHydratedRef = useRef<boolean>(false);
  const latestStateRef = useRef<CloudAppState>(cloudState);
  latestStateRef.current = cloudState;

  const isDark = cloudState.theme === 'dark';

  // Sync <html class="dark"> immediately whenever theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    setHeaderAvatarError(false);
  }, [cloudState.profileAvatar]);

  // Initialize runtime Supabase config & subscribe to Auth Session Changes
  useEffect(() => {
    let mounted = true;
    let unsubscribeAuth: (() => void) | null = null;

    const params =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : null;
    if (params?.get('autostart') === '1') {
      setLocalUser({ id: 'autostart_preview', email: 'preview@bleppify.app' });
      setAuthChecking(false);
      return () => {
        mounted = false;
      };
    }

    initSupabaseRuntimeConfig()
      .then(async (configured) => {
        if (!mounted) return;
        if (!configured) {
          setLocalUser(getLocalFallbackSession());
          setAuthChecking(false);
          return;
        }

        // Real Supabase is configured: clear any preview-only local session and bind Supabase Auth
        setLocalUser(null);
        try {
          const { data } = await supabase.auth.getSession();
          if (mounted) {
            setSession(data.session ?? null);
          }
        } catch {
          // Ignore initial session fetch error
        }

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, nextSession) => {
          if (!mounted) return;
          setSession(nextSession ?? null);
          if (event === 'PASSWORD_RECOVERY') {
            setIsPasswordRecoveryActive(true);
            setActiveTab('profile');
          }
          setAuthChecking(false);
        });
        unsubscribeAuth = () => subscription.unsubscribe();
        if (mounted) {
          setAuthChecking(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setAuthChecking(false);
        }
      });

    return () => {
      mounted = false;
      unsubscribeAuth?.();
    };
  }, []);

  // Hydrate user-scoped CloudAppState from Supabase user_data (or local fallback) once authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      isHydratedRef.current = false;
      setIsCloudHydrated(false);
      return;
    }

    let mounted = true;
    isHydratedRef.current = false;
    setIsCloudHydrated(false);

    const storageKey = getScopedLocalStorageKey(activeUserId);
    try {
      const cachedRaw = localStorage.getItem(storageKey);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw) as Partial<CloudAppState>;
        setCloudState((prev) => hydrateNormalizedState(parsed, prev.theme || 'light'));
      } else {
        setCloudState((prev) => createDefaultCloudState(prev.theme || 'light'));
      }
    } catch {
      setCloudState((prev) => createDefaultCloudState(prev.theme || 'light'));
    }

    loadCloudAppState(activeUserId)
      .then((loaded) => {
        if (!mounted) return;
        if (loaded) {
          setCloudState((prev) => hydrateNormalizedState(loaded, prev.theme || 'light'));
        }
        isHydratedRef.current = true;
        setIsCloudHydrated(true);
      })
      .catch(() => {
        if (mounted) {
          isHydratedRef.current = true;
          setIsCloudHydrated(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, activeUserId]);

  // Automatically persist changes to Supabase user_data + IndexedDB + localStorage
  useEffect(() => {
    if (!isAuthenticated || !isHydratedRef.current) return;

    const storageKey = getScopedLocalStorageKey(activeUserId);
    try {
      const lightweight = {
        ...cloudState,
        pdfsBySubject: {
          dev_psych: [],
          psych_assessment: [],
          abnormal_psych: [],
          io_psych: [],
        },
      };
      localStorage.setItem(storageKey, JSON.stringify(lightweight));
    } catch {
      // Ignore quota errors on localStorage
    }

    const timer = window.setTimeout(() => {
      void saveCloudAppState(cloudState, activeUserId);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [cloudState, isAuthenticated, activeUserId]);

  const handleToggleTheme = () => {
    setCloudState((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  };

  const handleToggleTopnotcherMode = (nextValue?: boolean) => {
    setCloudState((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      topnotcherMode:
        typeof nextValue === 'boolean' ? nextValue : !prev.topnotcherMode,
    }));
  };

  const handleUpdateTopnotcherThreshold = (nextThreshold: number) => {
    const normalized = normalizeTopnotcherThreshold(
      nextThreshold,
      DEFAULT_TOPNOTCHER_TARGET_PERCENT
    );
    setCloudState((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      topnotcherThreshold: normalized,
    }));
  };

  const handleSetExamDate = (nextExamDate: string) => {
    setCloudState((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      examDate: nextExamDate,
    }));
    setActiveTab('overview');
  };

  const handleSaveProfileSettings = (payload: ProfileSettingsUpdatePayload) => {
    setCloudState((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      profileName: payload.profileName,
      profileAvatar: payload.profileAvatar,
      dailyQuestionGoal: payload.dailyQuestionGoal,
      examDate: payload.examDate,
      topnotcherThreshold: normalizeTopnotcherThreshold(
        payload.topnotcherThreshold ?? prev.topnotcherThreshold,
        DEFAULT_TOPNOTCHER_TARGET_PERCENT
      ),
    }));
  };

  const handleApplyProfileAvatar = (nextAvatar: string | null) => {
    setCloudState((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      profileAvatar: nextAvatar,
    }));
  };

  const handleDeleteAccount = async (): Promise<{ ok: boolean; error?: string }> => {
    isHydratedRef.current = false;
    const storageKey = getScopedLocalStorageKey(activeUserId);
    const res = await deleteCloudAccountAndData(activeUserId, storageKey);
    if (!res.ok) {
      isHydratedRef.current = true;
      return res;
    }
    setIsCloudHydrated(false);
    setSession(null);
    setLocalUser(null);
    setActiveTab('overview');
    setIsMobileSubjectSheetOpen(false);
    setCloudState((prev) => createDefaultCloudState(prev.theme || 'light'));
    return { ok: true };
  };

  const handleSignOut = async () => {
    isHydratedRef.current = false;
    setIsCloudHydrated(false);
    if (isSupabaseConfigured && session) {
      await supabase.auth.signOut();
    }
    signOutLocalFallback();
    setSession(null);
    setLocalUser(null);
    setActiveTab('overview');
    setIsMobileSubjectSheetOpen(false);
    setCloudState((prev) => createDefaultCloudState(prev.theme || 'light'));
  };

  const handleSaveCloudProgressNow = async (): Promise<boolean> => {
    const nextState: CloudAppState = {
      ...latestStateRef.current,
      updatedAt: Date.now(),
    };
    const storageKey = getScopedLocalStorageKey(activeUserId);
    try {
      const lightweight = {
        ...nextState,
        pdfsBySubject: {
          dev_psych: [],
          psych_assessment: [],
          abnormal_psych: [],
          io_psych: [],
        },
      };
      localStorage.setItem(storageKey, JSON.stringify(lightweight));
    } catch {
      // Ignore localStorage quota
    }
    const ok = await saveCloudAppState(nextState, activeUserId);
    return ok;
  };

  const handleSelectSubject = (
    subjectId: SubjectId,
    mode: 'tos' | 'flashcards' | 'practice' | 'mock' = 'tos',
    explicitScopeKey?: string
  ) => {
    setLastVisitedSubjectId(subjectId);
    setInitialStudyMode(mode);
    if (explicitScopeKey !== undefined) {
      setScopeRequest({ scopeKey: explicitScopeKey, nonce: Date.now() });
    }
    setActiveTab(subjectId);
  };

  const handleToggleCompetency = (compId: string) => {
    setCloudState((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      masteredCompetencies: {
        ...prev.masteredCompetencies,
        [compId]: !prev.masteredCompetencies[compId],
      },
    }));
  };

  const handleMarkCompetenciesMastered = (compIds: string[]) => {
    if (compIds.length === 0) return;
    setCloudState((prev) => {
      let changed = false;
      const nextMastered = { ...prev.masteredCompetencies };
      for (const id of compIds) {
        if (!nextMastered[id]) {
          nextMastered[id] = true;
          changed = true;
        }
      }
      if (!changed) return prev;
      return {
        ...prev,
        updatedAt: Date.now(),
        masteredCompetencies: nextMastered,
      };
    });
  };

  const handleUpdateGrade = (subjectId: SubjectId, newGrade: number) => {
    setCloudState((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      grades: {
        ...prev.grades,
        [subjectId]: newGrade,
      },
    }));
  };

  const handleAddPdfFilesForSubject = (
    subjectId: SubjectId,
    newFiles: UploadedPdfFile[]
  ) => {
    setCloudState((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      pdfsBySubject: {
        ...prev.pdfsBySubject,
        [subjectId]: [...(prev.pdfsBySubject[subjectId] || []), ...newFiles],
      },
    }));
  };

  const handleRemovePdfForSubject = (subjectId: SubjectId, pdfId: string) => {
    setCloudState((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      pdfsBySubject: {
        ...prev.pdfsBySubject,
        [subjectId]: (prev.pdfsBySubject[subjectId] || []).filter((p) => p.id !== pdfId),
      },
    }));
  };

  const handleRecordSeenStems = (subjectId: SubjectId, stems: string[]) => {
    if (stems.length === 0) return;
    setCloudState((prev) => {
      const existing = prev.seenStemsBySubject?.[subjectId] || [];
      const merged = Array.from(new Set([...stems, ...existing])).slice(0, 140);
      return {
        ...prev,
        updatedAt: Date.now(),
        seenStemsBySubject: {
          ...DEFAULT_SEEN_MAP,
          ...(prev.seenStemsBySubject || {}),
          [subjectId]: merged,
        },
      };
    });
  };

  const handleRecordSeenTerms = (subjectId: SubjectId, terms: string[]) => {
    if (terms.length === 0) return;
    setCloudState((prev) => {
      const existing = prev.seenTermsBySubject?.[subjectId] || [];
      const merged = Array.from(new Set([...terms, ...existing])).slice(0, 80);
      return {
        ...prev,
        updatedAt: Date.now(),
        seenTermsBySubject: {
          ...DEFAULT_SEEN_MAP,
          ...(prev.seenTermsBySubject || {}),
          [subjectId]: merged,
        },
      };
    });
  };

  const handleLoadOfficialTosBankForSubject = (
    subjectId: SubjectId,
    targetMode: 'flashcards' | 'practice' | 'mock' = 'practice',
    targetScope = 'ALL'
  ) => {
    const subj = PRC_TOS_SUBJECTS[subjectId];
    setCloudState((prev) => {
      const existingQIds = new Set((prev.questionsBySubject[subjectId] || []).map((q) => q.id));
      const newQs = subj.seedQuestions.filter((q) => !existingQIds.has(q.id));
      const nextSubjectQs = [...(prev.questionsBySubject[subjectId] || []), ...newQs];

      const seedDeck = subj.seedFlashcards.slice(0, FLASHCARD_DECK_SIZE);
      const nextSessions = normalizeSessionsBySubject(prev.sessionsBySubject);
      nextSessions[subjectId] = {
        ...nextSessions[subjectId],
        practice: {
          ...nextSessions[subjectId].practice,
          selectedScope: targetScope,
          activeQuestionIds: subj.seedQuestions.map((q) => q.id),
          completedAt: 0,
        },
      };

      return {
        ...prev,
        updatedAt: Date.now(),
        questionsBySubject: {
          ...prev.questionsBySubject,
          [subjectId]: nextSubjectQs,
        },
        flashcardsBySubject: {
          ...prev.flashcardsBySubject,
          [subjectId]: seedDeck,
        },
        sessionsBySubject: nextSessions,
      };
    });
    setInitialStudyMode(targetMode);
    setScopeRequest({ scopeKey: targetScope, nonce: Date.now() });
    setActiveTab(subjectId);
  };

  const handleLoadAllOfficialBanks = () => {
    const subjectIds: SubjectId[] = [
      'dev_psych',
      'psych_assessment',
      'abnormal_psych',
      'io_psych',
    ];
    setCloudState((prev) => {
      const nextQuestions = { ...prev.questionsBySubject };
      const nextFlashcards = { ...prev.flashcardsBySubject };

      subjectIds.forEach((subjId) => {
        const subj = PRC_TOS_SUBJECTS[subjId];
        const existingQIds = new Set((nextQuestions[subjId] || []).map((q) => q.id));
        const newQs = subj.seedQuestions.filter((q) => !existingQIds.has(q.id));
        nextQuestions[subjId] = [...(nextQuestions[subjId] || []), ...newQs];
        nextFlashcards[subjId] = subj.seedFlashcards.slice(0, FLASHCARD_DECK_SIZE);
      });

      return {
        ...prev,
        updatedAt: Date.now(),
        questionsBySubject: nextQuestions,
        flashcardsBySubject: nextFlashcards,
      };
    });
    setLastVisitedSubjectId('psych_assessment');
    setInitialStudyMode('practice');
    setScopeRequest({ scopeKey: 'ALL', nonce: Date.now() });
    setActiveTab('psych_assessment');
  };

  const handleRecordQuestionAttempts = (newLogs: QuestionAttemptLog[]) => {
    setCloudState((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      attemptLogs: [...prev.attemptLogs, ...newLogs],
    }));
  };

  const handleUpdateSubjectSession = (
    subjectId: SubjectId,
    updater: (prev: SubjectSessionProgress) => SubjectSessionProgress
  ) => {
    setCloudState((prev) => {
      const currentMap = normalizeSessionsBySubject(prev.sessionsBySubject);
      const nextSubjSession = updater(currentMap[subjectId]);
      return {
        ...prev,
        updatedAt: Date.now(),
        sessionsBySubject: {
          ...currentMap,
          [subjectId]: nextSubjSession,
        },
      };
    });
  };

  const allResumableSessions = findResumableSessions(
    cloudState.sessionsBySubject,
    cloudState.questionsBySubject,
    PRC_TOS_SUBJECTS
  );

  const bannerResumableSessions = allResumableSessions.filter((sess) => {
    const isCurrentlyViewing =
      activeTab === sess.subjectId && initialStudyMode === sess.mode;
    if (isCurrentlyViewing) return false;
    if (dismissedSessionTimestamps[sess.id] === sess.updatedAt) return false;
    return true;
  });

  const handleResumeSession = (sessionInfo: ResumableSessionInfo) => {
    setLastVisitedSubjectId(sessionInfo.subjectId);
    setScopeRequest({ scopeKey: sessionInfo.scopeKey, nonce: Date.now() });
    setInitialStudyMode(sessionInfo.mode);
    setActiveTab(sessionInfo.subjectId);
    setResumeScroll({
      itemNumber: sessionInfo.nextItemNumber,
      nonce: Date.now(),
    });
  };

  const handleDiscardSession = (sessionInfo: ResumableSessionInfo) => {
    const empty = createEmptySubjectSession(MOCK_EXAM_DURATION_MINUTES);
    handleUpdateSubjectSession(sessionInfo.subjectId, (prev) => ({
      ...prev,
      [sessionInfo.mode]: empty[sessionInfo.mode],
    }));
  };

  const handleDismissSessionBanner = (sessionInfo: ResumableSessionInfo) => {
    setDismissedSessionTimestamps((prev) => ({
      ...prev,
      [sessionInfo.id]: sessionInfo.updatedAt,
    }));
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1320] text-[#0D254C] dark:text-[#E6ECF5]">
        <div className="text-sm font-display font-semibold tracking-tight">
          Loading BLEPPIFY...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <SupabaseAuthScreen
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        onLocalAuthenticated={(user) => setLocalUser(user)}
      />
    );
  }

  if (!isCloudHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-[#0B1320] text-[#0D254C] dark:text-[#E6ECF5]">
        <div className="text-sm font-display font-semibold tracking-tight">
          Loading BLEPPIFY...
        </div>
      </div>
    );
  }

  if (!cloudState.examDate) {
    return (
      <ExamDateSetupScreen
        isDark={isDark}
        initialDate={cloudState.examDate}
        userEmail={activeUserEmail}
        onToggleTheme={handleToggleTheme}
        onSignOut={handleSignOut}
        onConfirmExamDate={handleSetExamDate}
      />
    );
  }

  const headerInitials = extractProfileInitials(
    cloudState.profileName,
    activeUserEmail
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B1320] text-[#0F172A] dark:text-[#E6ECF5] transition-colors">
      {/* STRICT 3-ZONE MINIMALIST NAVIGATION BAR WITH STITCH PALETTE RIBBON */}
      <header className="bg-white dark:bg-[#131F33] border-b border-slate-200/90 dark:border-[#22324D] no-print transition-colors">
        <div aria-hidden="true" className="h-1 w-full grid grid-cols-3">
          <div className="bg-[#0D254C] dark:bg-[#234B82]" />
          <div className="bg-[#2E7978] dark:bg-[#2E7978]" />
          <div className="bg-[#D9822B] dark:bg-[#D9822B]" />
        </div>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-3 sm:gap-6">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              setIsMobileSubjectSheetOpen(false);
              setActiveTab('overview');
            }}
            className="text-base sm:text-lg font-display font-bold tracking-tight text-[#0D254C] dark:text-[#E6ECF5] whitespace-nowrap shrink-0"
          >
            BLEPPIFY
          </a>

          {/* Zone 3: Study Timer + Theme Toggle + Profile + Sign Out */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PomodoroBar
              completedToday={cloudState.pomodoroCompletedToday}
              onIncrementCompleted={() =>
                setCloudState((prev) => ({
                  ...prev,
                  updatedAt: Date.now(),
                  pomodoroCompletedToday: prev.pomodoroCompletedToday + 1,
                }))
              }
            />
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to eye-comfort dark mode'}
              className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 sm:p-1.5 rounded-lg border border-[#D9822B]/55 dark:border-[#9A5B1E] bg-[#FDF3E7] dark:bg-[#2C1D10] hover:bg-[#FAE6CE] dark:hover:bg-[#3A2615] text-[#3B2006] dark:text-[#F2AE63] transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileSubjectSheetOpen(false);
                setActiveTab('profile');
              }}
              aria-label="Profile settings"
              title="Profile settings"
              className={`inline-flex items-center justify-center gap-2 min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 sm:px-2.5 sm:py-1 rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'profile'
                  ? 'border-[#2E7978] bg-[#E6F4F4] dark:bg-[#112A2D] text-[#143D3C] dark:text-[#68C7C5]'
                  : 'border-slate-200 dark:border-[#293D5C] bg-[#F8FAFC] dark:bg-[#1A2942] hover:bg-slate-100 dark:hover:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5]'
              }`}
            >
              <span className="w-6 h-6 rounded-full overflow-hidden bg-[#EDF2FA] dark:bg-[#172844] border border-slate-200 dark:border-[#2B436B] inline-flex items-center justify-center shrink-0">
                {cloudState.profileAvatar && !headerAvatarError ? (
                  <img
                    src={cloudState.profileAvatar}
                    alt="Profile"
                    referrerPolicy="no-referrer"
                    onError={() => setHeaderAvatarError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-label font-bold text-[#0D254C] dark:text-[#9CC0F9]">
                    {headerInitials}
                  </span>
                )}
              </span>
              <span className="hidden sm:inline text-xs font-semibold">
                Profile
              </span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title={
                activeUserEmail
                  ? `Signed in as ${activeUserEmail} — Sign out`
                  : 'Sign out'
              }
              className="inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 dark:border-[#293D5C] bg-[#F8FAFC] dark:bg-[#1A2942] hover:bg-slate-100 dark:hover:bg-[#243858] text-xs font-semibold text-[#0D254C] dark:text-[#E6ECF5] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-5 sm:py-8">
        <ContinueSessionBar
          sessions={bannerResumableSessions}
          onResume={handleResumeSession}
          onDiscard={handleDiscardSession}
          onDismiss={handleDismissSessionBanner}
        />

        {activeTab === 'overview' ? (
          <OverviewDashboard
            masteredCompetencies={cloudState.masteredCompetencies}
            attemptLogs={cloudState.attemptLogs}
            pdfsBySubject={cloudState.pdfsBySubject}
            questionsBySubject={cloudState.questionsBySubject}
            flashcardsBySubject={cloudState.flashcardsBySubject}
            resumableSessions={allResumableSessions}
            onResumeSession={handleResumeSession}
            onSelectSubject={handleSelectSubject}
            onOpenAnalytics={() => setActiveTab('analytics')}
            examDate={cloudState.examDate}
            profileName={cloudState.profileName}
            profileAvatar={cloudState.profileAvatar}
            dailyQuestionGoal={cloudState.dailyQuestionGoal}
            topnotcherMode={Boolean(cloudState.topnotcherMode)}
            topnotcherThreshold={normalizeTopnotcherThreshold(
              cloudState.topnotcherThreshold,
              DEFAULT_TOPNOTCHER_TARGET_PERCENT
            )}
            onToggleTopnotcherMode={handleToggleTopnotcherMode}
            onUpdateTopnotcherThreshold={handleUpdateTopnotcherThreshold}
            userEmail={activeUserEmail}
            onOpenProfile={() => setActiveTab('profile')}
          />
        ) : activeTab === 'analytics' ? (
          <AnalyticsDashboard
            attemptLogs={cloudState.attemptLogs}
            masteredCompetencies={cloudState.masteredCompetencies}
            topnotcherMode={Boolean(cloudState.topnotcherMode)}
            topnotcherThreshold={normalizeTopnotcherThreshold(
              cloudState.topnotcherThreshold,
              DEFAULT_TOPNOTCHER_TARGET_PERCENT
            )}
            onToggleTopnotcherMode={handleToggleTopnotcherMode}
            onUpdateTopnotcherThreshold={handleUpdateTopnotcherThreshold}
            onBackToHome={() => setActiveTab('overview')}
            onClearLogs={() =>
              setCloudState((prev) => ({
                ...prev,
                updatedAt: Date.now(),
                attemptLogs: [],
              }))
            }
            onDrillTopic={(subjectId, sectionId) => {
              handleSelectSubject(subjectId, 'tos', sectionId);
            }}
            onLoadAllOfficialBanks={handleLoadAllOfficialBanks}
          />
        ) : activeTab === 'profile' ? (
          <ProfileSettingsView
            profileName={cloudState.profileName || ''}
            profileAvatar={cloudState.profileAvatar || null}
            dailyQuestionGoal={
              cloudState.dailyQuestionGoal || DEFAULT_DAILY_QUESTION_GOAL
            }
            topnotcherThreshold={normalizeTopnotcherThreshold(
              cloudState.topnotcherThreshold,
              DEFAULT_TOPNOTCHER_TARGET_PERCENT
            )}
            examDate={cloudState.examDate || null}
            userEmail={activeUserEmail}
            attemptLogs={cloudState.attemptLogs}
            isPasswordRecoveryActive={isPasswordRecoveryActive}
            onPasswordRecoveryComplete={() => setIsPasswordRecoveryActive(false)}
            onSaveProfile={handleSaveProfileSettings}
            onApplyAvatar={handleApplyProfileAvatar}
            onBackToHome={() => setActiveTab('overview')}
            onDeleteAccount={handleDeleteAccount}
          />
        ) : (
          <SubjectWorkspace
            subject={PRC_TOS_SUBJECTS[activeTab]}
            onBackToHome={() => setActiveTab('overview')}
            studyMode={initialStudyMode}
            onStudyModeChange={setInitialStudyMode}
            scopeRequest={scopeRequest}
            sessionProgress={
              normalizeSessionsBySubject(cloudState.sessionsBySubject)[activeTab]
            }
            onUpdateSessionProgress={(updater) =>
              handleUpdateSubjectSession(activeTab, updater)
            }
            resumeTargetItemNumber={resumeScroll.itemNumber}
            resumeNonce={resumeScroll.nonce}
            masteredCompetencies={cloudState.masteredCompetencies}
            onToggleCompetency={handleToggleCompetency}
            onMarkCompetenciesMastered={handleMarkCompetenciesMastered}
            onSaveProgressNow={handleSaveCloudProgressNow}
            onNavigateToAnalytics={() => setActiveTab('analytics')}
            seenStems={cloudState.seenStemsBySubject?.[activeTab] || []}
            onRecordSeenStems={(stems) => handleRecordSeenStems(activeTab, stems)}
            seenTerms={cloudState.seenTermsBySubject?.[activeTab] || []}
            onRecordSeenTerms={(terms) => handleRecordSeenTerms(activeTab, terms)}
            pdfFiles={cloudState.pdfsBySubject[activeTab] || []}
            onAddPdfFiles={(newFiles) =>
              handleAddPdfFilesForSubject(activeTab, newFiles)
            }
            onTogglePdfActive={(pdfId) =>
              setCloudState((prev) => ({
                ...prev,
                updatedAt: Date.now(),
                pdfsBySubject: {
                  ...prev.pdfsBySubject,
                  [activeTab]: (prev.pdfsBySubject[activeTab] || []).map((p) =>
                    p.id === pdfId ? { ...p, active: !p.active } : p
                  ),
                },
              }))
            }
            onRemovePdfFile={(pdfId) =>
              handleRemovePdfForSubject(activeTab, pdfId)
            }
            flashcards={cloudState.flashcardsBySubject[activeTab] || []}
            onUpdateFlashcards={(cards) =>
              setCloudState((prev) => ({
                ...prev,
                updatedAt: Date.now(),
                flashcardsBySubject: {
                  ...prev.flashcardsBySubject,
                  [activeTab]: cards,
                },
              }))
            }
            questions={cloudState.questionsBySubject[activeTab] || []}
            onUpdateQuestions={(updaterOrQuestions) =>
              setCloudState((prev) => {
                const currentList = prev.questionsBySubject[activeTab] || [];
                const nextList =
                  typeof updaterOrQuestions === 'function'
                    ? updaterOrQuestions(currentList)
                    : updaterOrQuestions;
                return {
                  ...prev,
                  updatedAt: Date.now(),
                  questionsBySubject: {
                    ...prev.questionsBySubject,
                    [activeTab]: nextList,
                  },
                };
              })
            }
            onLoadOfficialTosBank={(mode) =>
              handleLoadOfficialTosBankForSubject(activeTab, mode || 'practice', 'ALL')
            }
            onRecordMockScore={(pct) => handleUpdateGrade(activeTab, pct)}
            onRecordQuestionAttempts={handleRecordQuestionAttempts}
          />
        )}
      </main>

      {/* QUIET FOOTER (CLEARANCE FOR MOBILE BOTTOM NAV) */}
      <footer className="bg-white dark:bg-[#131F33] border-t border-slate-200/90 dark:border-[#22324D] px-4 sm:px-6 pt-3.5 pb-20 md:py-3.5 text-xs text-slate-500 dark:text-[#9FB0C7] no-print transition-colors">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-2">
          <span className="truncate text-slate-500 dark:text-[#9FB0C7]">
            {activeUserEmail ? activeUserEmail : 'BLEPPIFY'}
          </span>
        </div>
      </footer>

      <MobileBottomNav
        activeTab={activeTab}
        lastVisitedSubjectId={
          allResumableSessions[0]?.subjectId && lastVisitedSubjectId === 'psych_assessment'
            ? allResumableSessions[0].subjectId
            : lastVisitedSubjectId
        }
        masteredCompetencies={cloudState.masteredCompetencies}
        isSubjectSheetOpen={isMobileSubjectSheetOpen}
        onToggleSubjectSheet={(open) =>
          setIsMobileSubjectSheetOpen((prev) => (open !== undefined ? open : !prev))
        }
        onSelectOverview={() => setActiveTab('overview')}
        onSelectAnalytics={() => setActiveTab('analytics')}
        onSelectProfile={() => setActiveTab('profile')}
        onSelectSubject={(subjId) => {
          setLastVisitedSubjectId(subjId);
          setActiveTab(subjId);
        }}
      />
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  FileText,
} from 'lucide-react';
import {
  AutomaticSubjectProgressRow,
  buildSubjectMarimekkoData,
  calculateDailyQuestionProgress,
  calculateExamCountdown,
  computeAutomaticProgressGwa,
  extractFirstName,
  extractProfileInitials,
  formatThresholdPercent,
  getBoardMotivationalQuote,
  MarimekkoStatus,
  MAX_TOPNOTCHER_TARGET_PERCENT,
  MIN_TOPNOTCHER_TARGET_PERCENT,
  normalizeTopnotcherThreshold,
  QuestionAttemptLog,
  QUOTE_AUTO_ROTATE_INTERVAL_MS,
  ResumableSessionInfo,
  SubjectId,
  SubjectMarimekkoColumn,
  ZERO_SUBJECT_GRADES,
} from '../utils/bleppLogic';
import {
  BoardQuestionItem,
  FlashcardItem,
  PRC_TOS_SUBJECTS,
} from '../data/tosData';
import { UploadedPdfFile } from './SubjectWorkspace';

interface OverviewDashboardProps {
  masteredCompetencies: Record<string, boolean>;
  attemptLogs: QuestionAttemptLog[];
  pdfsBySubject: Record<SubjectId, UploadedPdfFile[]>;
  questionsBySubject: Record<SubjectId, BoardQuestionItem[]>;
  flashcardsBySubject: Record<SubjectId, FlashcardItem[]>;
  resumableSessions: ResumableSessionInfo[];
  onResumeSession: (session: ResumableSessionInfo) => void;
  onSelectSubject: (
    subjectId: SubjectId,
    initialMode?: 'tos' | 'flashcards' | 'practice' | 'mock',
    initialScope?: string
  ) => void;
  onOpenAnalytics: () => void;
  examDate?: string | null;
  profileName?: string;
  profileAvatar?: string | null;
  dailyQuestionGoal?: number;
  topnotcherMode: boolean;
  topnotcherThreshold: number;
  onToggleTopnotcherMode: (nextValue?: boolean) => void;
  onUpdateTopnotcherThreshold: (nextThreshold: number) => void;
  userEmail?: string | null;
  onOpenProfile: () => void;
}

const SUBJECT_STITCH_THEMES: Record<
  SubjectId,
  {
    headerBg: string;
    cardHoverBorder: string;
    kickerText: string;
    titleText: string;
    barTrack: string;
    barFill: string;
    studyBtn: string;
    linkHover: string;
    swatchClass: string;
    mekkoBarFill: string;
    mekkoInBarText: string;
    mekkoInBarSubText: string;
    mekkoAxisTitle: string;
    mekkoAxisWeight: string;
  }
> = {
  dev_psych: {
    // Stitch Palette 1: Primary Academic Navy (#0D254C)
    headerBg:
      'bg-[#EDF2FA] dark:bg-[#172844] border-b border-[#0D254C]/15 dark:border-[#2B436B]',
    cardHoverBorder:
      'hover:border-[#0D254C]/45 dark:hover:border-[#9CC0F9]/50',
    kickerText: 'text-[#0D254C] dark:text-[#9CC0F9]',
    titleText: 'text-[#0D254C] dark:text-[#F8FAFC]',
    barTrack: 'bg-[#DCE6F5] dark:bg-[#0B1320]',
    barFill: 'bg-[#0D254C] dark:bg-[#9CC0F9]',
    studyBtn:
      'bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] text-white',
    linkHover: 'hover:text-[#0D254C] dark:hover:text-[#9CC0F9]',
    swatchClass: 'bg-[#0D254C] dark:bg-[#5B8DEF]',
    mekkoBarFill: 'fill-[#0D254C] dark:fill-[#2B5998]',
    mekkoInBarText: 'fill-white dark:fill-[#F8FAFC]',
    mekkoInBarSubText: 'fill-[#DCE6F5] dark:fill-[#CBD5E1]',
    mekkoAxisTitle: 'fill-[#0D254C] dark:fill-[#E6F0FF]',
    mekkoAxisWeight: 'fill-[#334155] dark:fill-[#9CC0F9]',
  },
  psych_assessment: {
    // Stitch Palette 3: Tertiary Warm Ochre & Deep Umber (#D9822B / #3B2006)
    headerBg:
      'bg-[#FDF3E7] dark:bg-[#2A1C10] border-b border-[#D9822B]/35 dark:border-[#7A4715]',
    cardHoverBorder:
      'hover:border-[#D9822B]/70 dark:hover:border-[#F2AE63]/60',
    kickerText: 'text-[#8C4D11] dark:text-[#F2AE63]',
    titleText: 'text-[#3B2006] dark:text-[#F7DEC2]',
    barTrack: 'bg-[#F5E2CA] dark:bg-[#17100A]',
    barFill: 'bg-[#D9822B] dark:bg-[#F2AE63]',
    studyBtn:
      'bg-[#3B2006] hover:bg-[#522D0A] dark:bg-[#D9822B] dark:hover:bg-[#E5923D] text-white dark:text-[#1C1208]',
    linkHover: 'hover:text-[#8C4D11] dark:hover:text-[#F2AE63]',
    swatchClass: 'bg-[#D9822B] dark:bg-[#F2AE63]',
    mekkoBarFill: 'fill-[#D9822B] dark:fill-[#DF8B35]',
    mekkoInBarText: 'fill-[#1C1208] dark:fill-[#140C04]',
    mekkoInBarSubText: 'fill-[#3B2006] dark:fill-[#2A1806]',
    mekkoAxisTitle: 'fill-[#3B2006] dark:fill-[#FDE6C4]',
    mekkoAxisWeight: 'fill-[#8C4D11] dark:fill-[#F2AE63]',
  },
  abnormal_psych: {
    // Stitch Palette 2: Secondary Scholarly Teal (#2E7978)
    headerBg:
      'bg-[#E6F4F4] dark:bg-[#112A2D] border-b border-[#2E7978]/30 dark:border-[#255959]',
    cardHoverBorder:
      'hover:border-[#2E7978]/60 dark:hover:border-[#68C7C5]/55',
    kickerText: 'text-[#143D3C] dark:text-[#68C7C5]',
    titleText: 'text-[#143D3C] dark:text-[#D5F2F1]',
    barTrack: 'bg-[#CDE6E6] dark:bg-[#09181A]',
    barFill: 'bg-[#2E7978] dark:bg-[#68C7C5]',
    studyBtn:
      'bg-[#2E7978] hover:bg-[#246160] dark:bg-[#2E7978] dark:hover:bg-[#378C8B] text-white',
    linkHover: 'hover:text-[#22605F] dark:hover:text-[#68C7C5]',
    swatchClass: 'bg-[#2E7978] dark:bg-[#68C7C5]',
    mekkoBarFill: 'fill-[#246867] dark:fill-[#2B7A78]',
    mekkoInBarText: 'fill-white dark:fill-[#F8FAFC]',
    mekkoInBarSubText: 'fill-[#D5F2F1] dark:fill-[#CCFBF1]',
    mekkoAxisTitle: 'fill-[#143D3C] dark:fill-[#D5F2F1]',
    mekkoAxisWeight: 'fill-[#216463] dark:fill-[#68C7C5]',
  },
  io_psych: {
    // Stitch Palette 4: Neutral Slate & Inverted Charcoal (#ECEFF3 / #2D3136)
    headerBg:
      'bg-[#ECEFF3] dark:bg-[#1C283B] border-b border-slate-300/80 dark:border-[#334663]',
    cardHoverBorder:
      'hover:border-[#2D3136]/45 dark:hover:border-[#CBD5E1]/50',
    kickerText: 'text-[#2D3136] dark:text-[#CBD5E1]',
    titleText: 'text-[#1E2226] dark:text-[#F8FAFC]',
    barTrack: 'bg-[#D8DEE6] dark:bg-[#0B1320]',
    barFill: 'bg-[#2D3136] dark:bg-[#CBD5E1]',
    studyBtn:
      'bg-[#2D3136] hover:bg-[#1E2226] dark:bg-[#334663] dark:hover:bg-[#3F5678] text-white',
    linkHover: 'hover:text-[#0D254C] dark:hover:text-white',
    swatchClass: 'bg-[#334155] dark:bg-[#94A3B8]',
    mekkoBarFill: 'fill-[#334155] dark:fill-[#4B607C]',
    mekkoInBarText: 'fill-white dark:fill-[#F8FAFC]',
    mekkoInBarSubText: 'fill-[#E2E8F0] dark:fill-[#CBD5E1]',
    mekkoAxisTitle: 'fill-[#1E293B] dark:fill-[#F1F5F9]',
    mekkoAxisWeight: 'fill-[#475569] dark:fill-[#CBD5E1]',
  },
};

function getScoreColorClass(status: MarimekkoStatus): string {
  switch (status) {
    case 'STRENGTH':
      return 'text-[#1F6E66] dark:text-[#68C7C5]';
    case 'DEVELOPING':
      return 'text-[#8C4D11] dark:text-[#F2AE63]';
    case 'WEAKNESS':
    case 'CUTOFF_RISK':
      return 'text-rose-700 dark:text-rose-400';
    default:
      return 'text-slate-500 dark:text-[#9FB0C7]';
  }
}

function getGwaStatusColorClass(
  tone: AutomaticSubjectProgressRow['statusTone']
): string {
  switch (tone) {
    case 'topnotcher':
      return 'text-[#1F6E66] dark:text-[#68C7C5] font-semibold';
    case 'passing':
      return 'text-[#22605F] dark:text-[#68C7C5] font-medium';
    case 'developing':
      return 'text-[#8C4D11] dark:text-[#F2AE63] font-medium';
    case 'cutoff_risk':
      return 'text-rose-700 dark:text-rose-400 font-semibold';
    default:
      return 'text-slate-500 dark:text-[#9FB0C7]';
  }
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  masteredCompetencies,
  attemptLogs,
  pdfsBySubject,
  resumableSessions,
  onResumeSession,
  onSelectSubject,
  onOpenAnalytics,
  examDate,
  profileName,
  profileAvatar,
  dailyQuestionGoal,
  topnotcherMode,
  topnotcherThreshold,
  onToggleTopnotcherMode,
  onUpdateTopnotcherThreshold,
  userEmail,
  onOpenProfile,
}) => {
  const [selectedSubjectId, setSelectedSubjectId] = useState<SubjectId | null>(
    null
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [avatarImgError, setAvatarImgError] = useState<boolean>(false);
  const [quoteOffset, setQuoteOffset] = useState<number>(0);
  const [thresholdDraft, setThresholdDraft] = useState<string>(() =>
    formatThresholdPercent(topnotcherThreshold)
  );

  useEffect(() => {
    setThresholdDraft(formatThresholdPercent(topnotcherThreshold));
  }, [topnotcherThreshold]);

  useEffect(() => {
    setAvatarImgError(false);
  }, [profileAvatar]);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [examDate]);

  useEffect(() => {
    const quoteTimer = window.setInterval(() => {
      setQuoteOffset((prev) => prev + 1);
    }, QUOTE_AUTO_ROTATE_INTERVAL_MS);
    return () => window.clearInterval(quoteTimer);
  }, []);

  const firstName = extractFirstName(profileName, userEmail);
  const profileInitials = extractProfileInitials(profileName, userEmail);
  const activeQuote = getBoardMotivationalQuote(quoteOffset, nowMs);
  const dailyProgress = calculateDailyQuestionProgress(
    attemptLogs,
    dailyQuestionGoal,
    nowMs
  );
  const fmtTopThreshold = formatThresholdPercent(topnotcherThreshold);

  const handleThresholdDraftChange = (rawVal: string) => {
    setThresholdDraft(rawVal);
    const trimmed = rawVal.trim();
    if (!trimmed) return;
    const numeric = Number(trimmed);
    if (
      Number.isFinite(numeric) &&
      numeric >= MIN_TOPNOTCHER_TARGET_PERCENT &&
      numeric <= MAX_TOPNOTCHER_TARGET_PERCENT
    ) {
      onUpdateTopnotcherThreshold(numeric);
    }
  };

  const commitThresholdDraft = () => {
    const normalized = normalizeTopnotcherThreshold(
      thresholdDraft,
      topnotcherThreshold
    );
    onUpdateTopnotcherThreshold(normalized);
    setThresholdDraft(formatThresholdPercent(normalized));
  };

  const examCountdown = calculateExamCountdown(examDate, nowMs);
  const gwaResult = computeAutomaticProgressGwa(
    attemptLogs,
    PRC_TOS_SUBJECTS,
    masteredCompetencies,
    { topnotcherMode, topnotcherThreshold }
  );
  const subjectIds: SubjectId[] = [
    'dev_psych',
    'psych_assessment',
    'abnormal_psych',
    'io_psych',
  ];

  let totalAllComp = 0;
  let totalMasteredComp = 0;
  subjectIds.forEach((id) => {
    PRC_TOS_SUBJECTS[id].sections.forEach((sec) => {
      sec.competencies.forEach((c) => {
        totalAllComp++;
        if (masteredCompetencies[c.id]) totalMasteredComp++;
      });
    });
  });

  const mekko = buildSubjectMarimekkoData(
    attemptLogs,
    PRC_TOS_SUBJECTS,
    ZERO_SUBJECT_GRADES,
    masteredCompetencies,
    {
      topnotcherMode,
      topnotcherThreshold,
      ignoreManualGrades: true,
    }
  );

  const selectedColumn: SubjectMarimekkoColumn | null =
    (selectedSubjectId
      ? mekko.columns.find((c) => c.subjectId === selectedSubjectId)
      : null) || null;

  return (
    <div className="space-y-7 sm:space-y-10">
      {/* PERSONALIZED GREETING HERO + MOTIVATIONAL QUOTE + CURRENT GWA */}
      <section className="grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)_auto] items-start lg:items-center gap-4 lg:gap-8 border-b border-slate-200/90 dark:border-[#22324D] pb-5 sm:pb-6">
        {/* Left: Avatar + Hi [First Name] */}
        <div className="flex items-center gap-3.5 min-w-0 shrink-0">
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Open profile settings"
            title="Customize profile"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full overflow-hidden border border-slate-200 dark:border-[#2B436B] bg-[#EDF2FA] dark:bg-[#172844] flex items-center justify-center shrink-0 hover:border-[#2E7978] dark:hover:border-[#68C7C5] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2E7978]"
          >
            {profileAvatar && !avatarImgError ? (
              <img
                src={profileAvatar}
                alt={`${firstName} profile photo`}
                referrerPolicy="no-referrer"
                onError={() => setAvatarImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs sm:text-sm font-label font-bold text-[#0D254C] dark:text-[#9CC0F9]">
                {profileInitials}
              </span>
            )}
          </button>

          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-label font-semibold text-[#0D254C] dark:text-[#F8FAFC] tracking-tight truncate">
              Hi{' '}
              <span
                data-testid="greeting-first-name"
                className="font-display italic font-bold text-[#2E7978] dark:text-[#68C7C5]"
              >
                {firstName}
              </span>
            </h1>
          </div>
        </div>

        {/* Center: Automatic Motivational Quote with Reference Attribution */}
        <div
          role="region"
          aria-label="Board Exam Motivation"
          className="min-w-0 w-full border-y lg:border-y-0 lg:border-x border-slate-200/80 dark:border-[#22324D] py-3.5 lg:py-1 lg:px-6"
        >
          <blockquote
            data-testid="motivational-quote-text"
            className="font-display italic text-sm sm:text-[15px] leading-relaxed text-[#0F172A] dark:text-[#E6ECF5]"
          >
            “{activeQuote.quote}”
          </blockquote>
          <div className="mt-1.5 text-xs">
            <cite className="not-italic text-slate-600 dark:text-[#9FB0C7] min-w-0">
              <span className="font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
                — {activeQuote.author}
              </span>
              <span
                aria-hidden="true"
                className="mx-1.5 text-slate-300 dark:text-slate-600"
              >
                ·
              </span>
              <span>{activeQuote.workOrRole}</span>
            </cite>
          </div>
        </div>

        {/* Right: Automatic Current GWA & Syllabus Goals */}
        <div className="w-full lg:w-auto flex items-center justify-between lg:justify-end gap-6 text-xs shrink-0">
          <div>
            <div className="text-slate-500 dark:text-[#9FB0C7]">
              {topnotcherMode
                ? `Current GWA · ${fmtTopThreshold}% Goal`
                : 'Current GWA'}
            </div>
            <div
              data-testid="hero-current-gwa"
              className="font-mono tabular-nums text-xl sm:text-2xl font-bold text-[#0D254C] dark:text-[#9CC0F9] mt-0.5"
            >
              {gwaResult.gwa.toFixed(2)}%
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-[#293D5C]" />
          <div className="text-right lg:text-left">
            <div className="text-slate-500 dark:text-[#9FB0C7]">Syllabus Goals</div>
            <div className="font-mono tabular-nums text-sm font-bold text-[#22605F] dark:text-[#68C7C5] mt-1">
              {totalMasteredComp}/{totalAllComp} Cleared
            </div>
          </div>
        </div>
      </section>

      {/* BLEPP EXAM COUNTDOWN BANNER (CHANGE DATE MOVED TO PROFILE SETTINGS) */}
      {examCountdown && (
        <section
          aria-label="BLEPP Exam Countdown"
          className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl overflow-hidden transition-colors"
        >
          <div className="px-4 sm:px-6 py-4 sm:py-5 bg-[#EDF2FA]/65 dark:bg-[#172844] flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-[#9FB0C7]">
                <span className="font-semibold text-[#2E7978] dark:text-[#68C7C5] whitespace-nowrap">
                  BLEPP Exam Countdown
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-[#0F172A] dark:text-[#E6ECF5] whitespace-nowrap">
                  {examCountdown.formattedDate}
                </span>
              </div>
              <p className="text-sm sm:text-base font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
                {examCountdown.status === 'EXAM_DAY'
                  ? 'Today is your BLEPP Board Exam — trust your preparation, future RPm!'
                  : examCountdown.status === 'PAST'
                  ? 'Your scheduled exam date has passed — update your target date in Profile Settings.'
                  : 'Time remaining until your Psychometrician Licensure Examination'}
              </p>
            </div>

            <div className="grid grid-cols-4 divide-x divide-slate-200/90 dark:divide-[#2B436B] tabular-nums text-center shrink-0 sm:min-w-[340px]">
              <div className="px-2.5 sm:px-4">
                <div className="font-mono text-2xl sm:text-3xl font-bold text-[#0D254C] dark:text-[#F8FAFC] leading-none">
                  {String(examCountdown.days).padStart(2, '0')}
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-[#9FB0C7] mt-1.5">
                  Days
                </div>
              </div>
              <div className="px-2.5 sm:px-4">
                <div className="font-mono text-2xl sm:text-3xl font-bold text-[#0D254C] dark:text-[#F8FAFC] leading-none">
                  {String(examCountdown.hours).padStart(2, '0')}
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-[#9FB0C7] mt-1.5">
                  Hours
                </div>
              </div>
              <div className="px-2.5 sm:px-4">
                <div className="font-mono text-2xl sm:text-3xl font-bold text-[#2E7978] dark:text-[#68C7C5] leading-none">
                  {String(examCountdown.minutes).padStart(2, '0')}
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-[#9FB0C7] mt-1.5">
                  Minutes
                </div>
              </div>
              <div className="px-2.5 sm:px-4">
                <div className="font-mono text-2xl sm:text-3xl font-bold text-[#D9822B] dark:text-[#F2AE63] leading-none">
                  {String(examCountdown.seconds).padStart(2, '0')}
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-[#9FB0C7] mt-1.5">
                  Seconds
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* DAILY QUESTIONS GOAL PROGRESS ON HOMEPAGE */}
      <section
        aria-label="Daily Questions Goal"
        className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl px-4 sm:px-6 py-4 transition-colors space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-y-0.5 sm:gap-x-2 text-xs min-w-0">
            <span className="font-label font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
              Daily Questions Goal
            </span>
            <span
              aria-hidden="true"
              className="hidden sm:inline text-slate-300 dark:text-slate-600"
            >
              ·
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span
                className={
                  dailyProgress.isGoalMet
                    ? 'font-semibold text-[#22605F] dark:text-[#68C7C5]'
                    : 'text-slate-600 dark:text-[#9FB0C7]'
                }
              >
                {dailyProgress.isGoalMet ? (
                  'Daily goal reached'
                ) : (
                  <>
                    <span className="font-mono font-semibold text-[#0F172A] dark:text-[#E6ECF5]">
                      {dailyProgress.remainingToday}
                    </span>{' '}
                    {dailyProgress.remainingToday === 1 ? 'item' : 'items'} remaining today
                  </>
                )}
              </span>
              {dailyProgress.answeredToday > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <span className="text-slate-600 dark:text-[#9FB0C7]">
                    <span className="font-mono font-semibold">
                      {dailyProgress.accuracyTodayPercent}%
                    </span>{' '}
                    accuracy today
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
            <div className="text-xs text-slate-500 dark:text-[#9FB0C7]">
              <span className="font-mono text-sm font-bold text-[#0D254C] dark:text-[#F8FAFC]">
                {dailyProgress.answeredToday}/{dailyProgress.dailyGoal}
              </span>{' '}
              <span>Items Answered</span>
            </div>
            <button
              type="button"
              onClick={onOpenProfile}
              className="text-xs font-semibold text-[#2E7978] dark:text-[#68C7C5] hover:underline whitespace-nowrap"
            >
              Edit Goal
            </button>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="h-2 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-[#0B1320]"
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              dailyProgress.isGoalMet
                ? 'bg-[#2E7978] dark:bg-[#68C7C5]'
                : 'bg-[#D9822B] dark:bg-[#F2AE63]'
            }`}
            style={{
              width: `${Math.max(
                dailyProgress.progressPercent,
                dailyProgress.answeredToday > 0 ? 4 : 0
              )}%`,
            }}
          />
        </div>
      </section>

      {/* 4 SUBJECT CARDS — MINIMALIST & MAPPED TO THE 4 GOOGLE STITCH PALETTE FAMILIES */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {subjectIds.map((subjId) => {
          const subj = PRC_TOS_SUBJECTS[subjId];
          const theme = SUBJECT_STITCH_THEMES[subjId];
          const subjectPdfs = pdfsBySubject[subjId] || [];
          const activeSubjectSession = resumableSessions.find(
            (s) => s.subjectId === subjId
          );

          let subjTotalComp = 0;
          let subjMasteredComp = 0;
          subj.sections.forEach((s) => {
            s.competencies.forEach((c) => {
              subjTotalComp++;
              if (masteredCompetencies[c.id]) subjMasteredComp++;
            });
          });
          const masteryRatio =
            subjTotalComp > 0
              ? Math.round((subjMasteredComp / subjTotalComp) * 100)
              : 0;

          return (
            <div
              key={subj.id}
              className={`bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl overflow-hidden flex flex-col justify-between transition-colors ${theme.cardHoverBorder}`}
            >
              {/* Tonal Stitch Palette Band */}
              <div className={`px-4 sm:px-6 pt-4 sm:pt-5 pb-3.5 sm:pb-4 space-y-2.5 ${theme.headerBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                  {subjectPdfs.length > 0 ? (
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${theme.kickerText}`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>
                        {subjectPdfs.length}{' '}
                        {subjectPdfs.length === 1 ? 'PDF' : 'PDFs'}
                      </span>
                    </span>
                  ) : (
                    <span aria-hidden="true" />
                  )}

                  <span
                    className={
                      subjMasteredComp === subjTotalComp && subjTotalComp > 0
                        ? 'text-[#22605F] dark:text-[#68C7C5] font-semibold'
                        : 'text-[#475569] dark:text-[#C5D2E3]'
                    }
                  >
                    {subjMasteredComp}/{subjTotalComp} Mastered
                  </span>
                </div>

                <h2 className={`text-lg sm:text-xl font-display font-semibold ${theme.titleText}`}>
                  {subj.fullTitle}
                </h2>

                <div
                  aria-hidden="true"
                  className={`h-1.5 w-full rounded-full overflow-hidden ${theme.barTrack}`}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${theme.barFill}`}
                    style={{
                      width: `${Math.max(masteryRatio, subjMasteredComp > 0 ? 6 : 0)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Clean Neutral Action Footer */}
              <div className="px-4 sm:px-6 py-3.5 bg-white dark:bg-[#131F33]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center justify-between sm:justify-start gap-x-2.5 gap-y-1 text-xs font-medium text-slate-600 dark:text-[#9FB0C7]">
                    <button
                      type="button"
                      onClick={() => onSelectSubject(subj.id, 'tos')}
                      className={`py-1 ${theme.linkHover} transition-colors whitespace-nowrap`}
                    >
                      Syllabus
                    </button>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectSubject(subj.id, 'flashcards')}
                      className={`py-1 ${theme.linkHover} transition-colors whitespace-nowrap`}
                    >
                      Flashcards
                    </button>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectSubject(subj.id, 'practice')}
                      className={`py-1 ${theme.linkHover} transition-colors whitespace-nowrap`}
                    >
                      Quiz
                    </button>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectSubject(subj.id, 'mock')}
                      className={`py-1 ${theme.linkHover} transition-colors whitespace-nowrap`}
                    >
                      Mock Exam
                    </button>
                  </div>

                  {activeSubjectSession ? (
                    <button
                      type="button"
                      onClick={() => onResumeSession(activeSubjectSession)}
                      className="w-full sm:w-auto min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-1.5 bg-[#2E7978] hover:bg-[#246160] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>
                        Continue {activeSubjectSession.mode === 'mock' ? 'Mock' : 'Quiz'} (
                        {activeSubjectSession.completedCount}/{activeSubjectSession.totalItems})
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectSubject(subj.id, 'tos')}
                      className={`w-full sm:w-auto min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${theme.studyBtn}`}
                    >
                      <span>Study</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* SUBJECT PERFORMANCE ANALYSIS — MINIMALIST MARIMEKKO + PROMINENT STUDY PROMPTS */}
      <section className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl overflow-hidden transition-colors">
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#E6F4F4]/70 dark:bg-[#112A2D] border-b border-[#2E7978]/25 dark:border-[#255959] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
              Subject Analysis
            </h2>
            {mekko.testedSubjectsCount > 0 && (
              <span className="text-xs font-mono font-semibold tabular-nums text-[#143D3C] dark:text-[#68C7C5]">
                {mekko.weightedReadinessPercent.toFixed(1)}% Overall
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div
              role="group"
              aria-label="Subject Analysis benchmark mode"
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-white/85 dark:bg-[#0D1726] border border-slate-200/90 dark:border-[#22324D]"
            >
              <button
                type="button"
                aria-pressed={!topnotcherMode}
                onClick={() => onToggleTopnotcherMode(false)}
                className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  !topnotcherMode
                    ? 'bg-[#0D254C] text-white dark:bg-[#1B2B45] dark:text-[#F8FAFC] font-semibold'
                    : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
                }`}
              >
                Standard · 75%
              </button>
              <button
                type="button"
                aria-pressed={topnotcherMode}
                onClick={() => onToggleTopnotcherMode(true)}
                className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  topnotcherMode
                    ? 'bg-[#3B2006] text-white dark:bg-[#D9822B] dark:text-[#1C1208] font-semibold'
                    : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#3B2006] dark:hover:text-[#F2AE63]'
                }`}
              >
                Topnotcher · {fmtTopThreshold}%
              </button>
              {topnotcherMode && (
                <div className="inline-flex items-center gap-0.5 pl-1 pr-1.5 border-l border-slate-200 dark:border-[#293D5C]">
                  <label
                    htmlFor="subject-analysis-topnotcher-threshold"
                    className="sr-only"
                  >
                    Topnotcher threshold percentage
                  </label>
                  <input
                    id="subject-analysis-topnotcher-threshold"
                    type="number"
                    inputMode="decimal"
                    min={MIN_TOPNOTCHER_TARGET_PERCENT}
                    max={MAX_TOPNOTCHER_TARGET_PERCENT}
                    step="0.5"
                    aria-label="Topnotcher threshold percentage"
                    value={thresholdDraft}
                    onChange={(e) => handleThresholdDraftChange(e.target.value)}
                    onBlur={commitThresholdDraft}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitThresholdDraft();
                      }
                    }}
                    className="w-12 min-h-[28px] px-1.5 py-0.5 text-right text-xs font-mono tabular-nums font-bold bg-[#FDF3E7] dark:bg-[#2A1C10] text-[#3B2006] dark:text-[#F2AE63] border border-[#D9822B]/50 dark:border-[#9A5B1E] rounded focus:outline-none focus:border-[#0D254C] dark:focus:border-[#68C7C5]"
                  />
                  <span className="text-[11px] font-mono font-semibold text-[#8C4D11] dark:text-[#F2AE63]">
                    %
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenAnalytics}
              className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 sm:py-1.5 bg-[#0D254C] hover:bg-[#163567] dark:bg-[#2E7978] dark:hover:bg-[#378C8B] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <span>More Information</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* LEFT COLUMN: CLEAN 4-SUBJECT MARIMEKKO CHART */}
          <div className="lg:col-span-6 min-w-0 flex flex-col">
            <svg
              viewBox={`0 0 ${mekko.viewBoxWidth} ${mekko.viewBoxHeight}`}
              role="img"
              aria-label={`Subject analysis chart. Overall score ${mekko.weightedReadinessPercent}% against ${
                topnotcherMode ? `${fmtTopThreshold}% topnotcher, ` : ''
              }75% passing and 50% cutoff.`}
              className="w-full h-auto select-none"
            >
              {/* Y-Axis Score Ticks & Subtle Gridlines */}
              {mekko.yTicks.map((tick) => {
                const isTopTick =
                  topnotcherMode && tick.percent === mekko.topnotcherTargetPercent;
                const isThreshold =
                  isTopTick ||
                  tick.percent === 75 ||
                  tick.percent === 50;
                return (
                  <g key={`ytick_${tick.percent}`}>
                    {!isThreshold && (
                      <line
                        x1={mekko.plotLeft}
                        y1={tick.y}
                        x2={mekko.plotRight}
                        y2={tick.y}
                        strokeWidth="1"
                        className="stroke-slate-200/80 dark:stroke-[#22324D]"
                      />
                    )}
                    <text
                      x={mekko.plotLeft - 8}
                      y={(tick.labelY ?? tick.y) + 3.5}
                      textAnchor="end"
                      fontSize="10.5"
                      fontWeight={isThreshold ? '700' : '500'}
                      className={
                        isTopTick
                          ? 'font-mono fill-[#8C4D11] dark:fill-[#F2AE63]'
                          : tick.percent === 75
                          ? 'font-mono fill-[#0D254C] dark:fill-[#68C7C5]'
                          : tick.percent === 50
                          ? 'font-mono fill-rose-700 dark:fill-rose-400'
                          : 'font-mono fill-slate-500 dark:fill-[#9FB0C7]'
                      }
                    >
                      {`${formatThresholdPercent(tick.percent)}%`}
                    </text>
                  </g>
                );
              })}

              {/* 4 Weight-Proportional Subject Columns (40% | 20% | 20% | 20%) */}
              {mekko.columns.map((col) => {
                const theme = SUBJECT_STITCH_THEMES[col.subjectId];
                const isSelected = selectedSubjectId === col.subjectId;
                const isDimmed =
                  selectedColumn !== null &&
                  selectedColumn.subjectId !== col.subjectId;
                const showInsideBar =
                  col.metricSource !== 'UNTESTED' && col.barHeight >= 32;

                return (
                  <g
                    key={col.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${col.title}, ${col.weightPercent}% weight, ${
                      col.metricSource === 'UNTESTED'
                        ? 'untested'
                        : `${col.currentPercent}%`
                    }`}
                    onClick={() =>
                      setSelectedSubjectId((prev) =>
                        prev === col.subjectId ? null : col.subjectId
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedSubjectId((prev) =>
                          prev === col.subjectId ? null : col.subjectId
                        );
                      }
                    }}
                    className={`cursor-pointer transition-opacity duration-150 focus:outline-none ${
                      isDimmed ? 'opacity-45 hover:opacity-90' : 'hover:opacity-95'
                    }`}
                  >
                    <title>{`${col.title} (${col.weightPercent}%) — ${
                      col.metricSource === 'UNTESTED'
                        ? 'Untested'
                        : `${col.currentPercent}%`
                    }`}</title>

                    <rect
                      x={col.x}
                      y={col.trackY}
                      width={col.width}
                      height={col.trackHeight}
                      rx={4}
                      strokeWidth={isSelected ? 2 : 1}
                      className={`fill-slate-100/90 dark:fill-[#0D1726] ${
                        isSelected
                          ? 'stroke-[#0D254C] dark:stroke-[#9CC0F9]'
                          : 'stroke-slate-200/95 dark:stroke-[#22324D]'
                      }`}
                    />

                    {col.deficitHeight > 0 && col.metricSource !== 'UNTESTED' && (
                      <rect
                        x={col.x + 1}
                        y={col.deficitY}
                        width={Math.max(0, col.width - 2)}
                        height={col.deficitHeight}
                        className={
                          col.status === 'CUTOFF_RISK'
                            ? 'fill-rose-500/14 dark:fill-rose-400/14'
                            : 'fill-amber-500/12 dark:fill-amber-400/12'
                        }
                      />
                    )}

                    {col.barHeight > 0 && (
                      <rect
                        x={col.x}
                        y={col.barY}
                        width={col.width}
                        height={col.barHeight}
                        rx={3}
                        className={theme.mekkoBarFill}
                      />
                    )}

                    {/* Clean Percentage Only Inside Bar */}
                    {showInsideBar ? (
                      <text
                        x={col.centerX}
                        y={mekko.plotBottom - 12}
                        textAnchor="middle"
                        fontSize="13"
                        fontWeight="700"
                        className={`pointer-events-none font-mono ${theme.mekkoInBarText}`}
                      >
                        {`${col.currentPercent.toFixed(1)}%`}
                      </text>
                    ) : (
                      <text
                        x={col.centerX}
                        y={Math.min(mekko.plotBottom - 10, col.barY - 8)}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight="600"
                        className="pointer-events-none font-mono fill-slate-500 dark:fill-[#9FB0C7]"
                      >
                        {col.metricSource === 'UNTESTED'
                          ? 'Untested'
                          : `${col.currentPercent.toFixed(1)}%`}
                      </text>
                    )}

                    {/* Subject Title + Weight Percentage */}
                    <text
                      x={col.centerX}
                      y={mekko.plotBottom + 20}
                      textAnchor="middle"
                      className="font-sans"
                    >
                      <tspan
                        x={col.centerX}
                        fontSize="11"
                        fontWeight={col.weightPercent >= 40 ? '700' : '600'}
                        className={theme.mekkoAxisTitle}
                      >
                        {col.compactTitle}
                      </tspan>
                      <tspan
                        x={col.centerX}
                        dy="1.3em"
                        fontSize="10.5"
                        fontWeight={col.weightPercent >= 40 ? '700' : '600'}
                        className={`font-mono ${theme.mekkoAxisWeight}`}
                      >
                        {`${col.weightPercent}%`}
                      </tspan>
                    </text>
                  </g>
                );
              })}

              {/* 50% Cutoff Dotted Line */}
              <line
                x1={mekko.plotLeft}
                y1={mekko.cutoffLineY}
                x2={mekko.plotRight}
                y2={mekko.cutoffLineY}
                strokeWidth="3.4"
                className="stroke-white/80 dark:stroke-[#0B1320]/80 pointer-events-none"
              />
              <line
                x1={mekko.plotLeft}
                y1={mekko.cutoffLineY}
                x2={mekko.plotRight}
                y2={mekko.cutoffLineY}
                strokeWidth="1.75"
                strokeDasharray="3 4.5"
                className="stroke-rose-600 dark:stroke-rose-400 pointer-events-none"
              />

              {/* 75% Passing Dashed Line */}
              <line
                x1={mekko.plotLeft}
                y1={mekko.passingLineY}
                x2={mekko.plotRight}
                y2={mekko.passingLineY}
                strokeWidth={topnotcherMode ? '3' : '3.8'}
                className="stroke-white/85 dark:stroke-[#0B1320]/85 pointer-events-none"
              />
              <line
                x1={mekko.plotLeft}
                y1={mekko.passingLineY}
                x2={mekko.plotRight}
                y2={mekko.passingLineY}
                strokeWidth={topnotcherMode ? '1.6' : '2.2'}
                strokeDasharray="7 5"
                className="stroke-[#0D254C] dark:stroke-[#5EEAD4] pointer-events-none"
              />

              {/* 85% Topnotcher Benchmark Line (When Topnotcher Mode Active) */}
              {topnotcherMode && (
                <>
                  <line
                    x1={mekko.plotLeft}
                    y1={mekko.topnotcherLineY}
                    x2={mekko.plotRight}
                    y2={mekko.topnotcherLineY}
                    strokeWidth="3.8"
                    className="stroke-white/85 dark:stroke-[#0B1320]/85 pointer-events-none"
                  />
                  <line
                    x1={mekko.plotLeft}
                    y1={mekko.topnotcherLineY}
                    x2={mekko.plotRight}
                    y2={mekko.topnotcherLineY}
                    strokeWidth="2.3"
                    strokeDasharray="8 4"
                    className="stroke-[#D9822B] dark:stroke-[#F2AE63] pointer-events-none"
                  />
                </>
              )}
            </svg>

            {/* Minimal Threshold Key */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-slate-600 dark:text-[#9FB0C7]">
              {topnotcherMode && (
                <>
                  <span className="inline-flex items-center gap-2 font-semibold text-[#8C4D11] dark:text-[#F2AE63]">
                    <svg width="20" height="6" aria-hidden="true">
                      <line
                        x1="0"
                        y1="3"
                        x2="20"
                        y2="3"
                        strokeWidth="2.3"
                        strokeDasharray="6 3"
                        className="stroke-[#D9822B] dark:stroke-[#F2AE63]"
                      />
                    </svg>
                    <span>{fmtTopThreshold}% Topnotcher</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                </>
              )}
              <span className="inline-flex items-center gap-2">
                <svg width="20" height="6" aria-hidden="true">
                  <line
                    x1="0"
                    y1="3"
                    x2="20"
                    y2="3"
                    strokeWidth="2.2"
                    strokeDasharray="5 4"
                    className="stroke-[#0D254C] dark:stroke-[#5EEAD4]"
                  />
                </svg>
                <span>75% Passing</span>
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                ·
              </span>
              <span className="inline-flex items-center gap-2">
                <svg width="20" height="6" aria-hidden="true">
                  <line
                    x1="0"
                    y1="3"
                    x2="20"
                    y2="3"
                    strokeWidth="1.75"
                    strokeDasharray="2.5 3.5"
                    className="stroke-rose-600 dark:stroke-rose-400"
                  />
                </svg>
                <span>50% Cutoff</span>
              </span>
            </div>
          </div>

          {/* RIGHT COLUMN: STUDY PROMPTS & STRENGTHS (STANDARD OR TOPNOTCHER PUSH) */}
          <div className="lg:col-span-6 min-w-0 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 dark:border-[#22324D] pb-2.5">
                <h3 className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
                  {topnotcherMode
                    ? 'Topnotcher Push & Study Prompts'
                    : 'Weaknesses & Study Prompts'}
                </h3>
                {selectedColumn && (
                  <button
                    type="button"
                    onClick={() => setSelectedSubjectId(null)}
                    className="text-xs font-medium text-slate-500 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white whitespace-nowrap shrink-0"
                  >
                    Clear highlight
                  </button>
                )}
              </div>

              {mekko.studyPrompts.length === 0 ? (
                <div className="py-3 space-y-2">
                  <p className="text-sm text-[#1F6E66] dark:text-[#68C7C5]">
                    {topnotcherMode
                      ? `All 4 BLEPP subjects are at ${mekko.topnotcherTargetPercent.toFixed(
                          1
                        )}% or above — Topnotcher caliber across every board area.`
                      : 'All 4 subjects are at 75% or above.'}
                  </p>
                  {!topnotcherMode && (
                    <button
                      type="button"
                      onClick={() => onToggleTopnotcherMode(true)}
                      className="text-xs font-semibold text-[#8C4D11] dark:text-[#F2AE63] hover:underline"
                    >
                      Switch to Topnotcher · {fmtTopThreshold}% mode to push higher
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-[#22324D]">
                  {mekko.studyPrompts.map((col) => {
                    const scoreColor = getScoreColorClass(col.status);
                    const isHighlighted = selectedSubjectId === col.subjectId;
                    const theme = SUBJECT_STITCH_THEMES[col.subjectId];

                    return (
                      <div
                        key={`prompt_${col.id}`}
                        className={`py-4 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isHighlighted
                            ? 'px-3.5 -mx-3.5 rounded-lg bg-[#FDF3E7]/60 dark:bg-[#1B2B45]'
                            : ''
                        }`}
                      >
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                            <span className="text-base font-display font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                              {col.title}
                            </span>
                            <span className={`text-base font-mono tabular-nums font-bold ${scoreColor}`}>
                              {col.metricSource === 'UNTESTED'
                                ? 'Untested'
                                : `${col.currentPercent.toFixed(1)}%`}
                            </span>
                          </div>

                          {col.prioritySectionTitle && (
                            <div className="text-sm text-slate-600 dark:text-[#C5D2E3] leading-snug">
                              <span>{col.prioritySectionTitle}</span>
                              {col.prioritySectionPercent !== null && (
                                <span
                                  className={`ml-2 font-mono tabular-nums font-semibold ${
                                    col.prioritySectionPercent <
                                    (topnotcherMode ? 75 : 60)
                                      ? 'text-rose-700 dark:text-rose-400'
                                      : 'text-[#8C4D11] dark:text-[#F2AE63]'
                                  }`}
                                >
                                  {col.prioritySectionPercent}%
                                </span>
                              )}
                            </div>
                          )}

                          {col.status === 'CUTOFF_RISK' ? (
                            <div className="text-xs font-medium text-rose-700 dark:text-rose-400">
                              Below 50% subject cutoff
                            </div>
                          ) : (
                            topnotcherMode &&
                            col.metricSource !== 'UNTESTED' &&
                            col.weightedGapToPassing > 0 && (
                              <div className="text-xs text-[#8C4D11] dark:text-[#F2AE63]">
                                {col.currentPercent >= 75
                                  ? `Passing — lift +${Math.max(
                                      0,
                                      mekko.topnotcherTargetPercent - col.currentPercent
                                    ).toFixed(1)}% for +${col.weightedGapToPassing.toFixed(
                                      2
                                    )}% GWA toward Topnotcher`
                                  : `Below 75% passing — +${col.weightedGapToPassing.toFixed(
                                      2
                                    )}% GWA upside to ${fmtTopThreshold}%`}
                              </div>
                            )
                          )}
                        </div>

                        <button
                          type="button"
                          aria-label={`${col.ctaLabel} ${col.title}`}
                          onClick={() =>
                            onSelectSubject(
                              col.subjectId,
                              'tos',
                              col.prioritySectionId || 'ALL'
                            )
                          }
                          className={`w-full sm:w-auto sm:self-center min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${theme.studyBtn}`}
                        >
                          <span>{col.ctaLabel}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MINIMAL STRENGTHS (>=75% STANDARD OR >=TOPNOTCHER THRESHOLD) */}
            {mekko.strengths.length > 0 && (
              <div className="pt-4 border-t border-slate-200/80 dark:border-[#22324D] space-y-2.5">
                <h3 className="text-sm font-display font-semibold text-[#143D3C] dark:text-[#68C7C5]">
                  {topnotcherMode
                    ? `Topnotcher Strengths (≥${fmtTopThreshold}%)`
                    : 'Strengths (≥75%)'}
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-[#22324D]">
                  {mekko.strengths.map((st) => {
                    const isHighlighted = selectedSubjectId === st.subjectId;
                    return (
                      <div
                        key={`strength_${st.id}`}
                        className={`py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 transition-colors ${
                          isHighlighted
                            ? 'px-3 -mx-3 rounded-md bg-[#E6F4F4]/60 dark:bg-[#182B36]'
                            : ''
                        }`}
                      >
                        <span className="text-sm font-medium text-[#0F172A] dark:text-[#E6ECF5] truncate">
                          {st.title}
                        </span>
                        <span className="text-sm font-mono tabular-nums font-bold text-[#1F6E66] dark:text-[#68C7C5] shrink-0">
                          {st.currentPercent.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* AUTOMATIC PROGRESS-DRIVEN GWA CALCULATOR — STACKED MOBILE CARDS + DESKTOP TABLE */}
      <section
        aria-label="GWA Calculator"
        className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl overflow-hidden transition-colors"
      >
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#EDF2FA]/75 dark:bg-[#172844] border-b border-slate-200/80 dark:border-[#2B436B] flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
            GWA Calculator
          </h2>

          <div
            role="group"
            aria-label="GWA Calculator benchmark mode"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-white/85 dark:bg-[#0D1726] border border-slate-200/90 dark:border-[#22324D]"
          >
            <button
              type="button"
              aria-pressed={!topnotcherMode}
              onClick={() => onToggleTopnotcherMode(false)}
              className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                !topnotcherMode
                  ? 'bg-[#0D254C] text-white dark:bg-[#1B2B45] dark:text-[#F8FAFC] font-semibold'
                  : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
              }`}
            >
              Standard · 75%
            </button>
            <button
              type="button"
              aria-pressed={topnotcherMode}
              onClick={() => onToggleTopnotcherMode(true)}
              className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                topnotcherMode
                  ? 'bg-[#3B2006] text-white dark:bg-[#D9822B] dark:text-[#1C1208] font-semibold'
                  : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#3B2006] dark:hover:text-[#F2AE63]'
              }`}
            >
              Topnotcher · {fmtTopThreshold}%
            </button>
            {topnotcherMode && (
              <div className="inline-flex items-center gap-0.5 pl-1 pr-1.5 border-l border-slate-200 dark:border-[#293D5C]">
                <label
                  htmlFor="gwa-calculator-topnotcher-threshold"
                  className="sr-only"
                >
                  GWA Topnotcher threshold percentage
                </label>
                <input
                  id="gwa-calculator-topnotcher-threshold"
                  type="number"
                  inputMode="decimal"
                  min={MIN_TOPNOTCHER_TARGET_PERCENT}
                  max={MAX_TOPNOTCHER_TARGET_PERCENT}
                  step="0.5"
                  aria-label="GWA Topnotcher threshold percentage"
                  value={thresholdDraft}
                  onChange={(e) => handleThresholdDraftChange(e.target.value)}
                  onBlur={commitThresholdDraft}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitThresholdDraft();
                    }
                  }}
                  className="w-12 min-h-[28px] px-1.5 py-0.5 text-right text-xs font-mono tabular-nums font-bold bg-[#FDF3E7] dark:bg-[#2A1C10] text-[#3B2006] dark:text-[#F2AE63] border border-[#D9822B]/50 dark:border-[#9A5B1E] rounded focus:outline-none focus:border-[#0D254C] dark:focus:border-[#68C7C5]"
                />
                <span className="text-[11px] font-mono font-semibold text-[#8C4D11] dark:text-[#F2AE63]">
                  %
                </span>
              </div>
            )}
          </div>
        </div>

        {/* MOBILE STACKED SUBJECT CARDS (ZERO HORIZONTAL SCROLL, AUTO-COMPUTED) */}
        <div className="sm:hidden p-4 space-y-3">
          {subjectIds.map((subjId) => {
            const row = gwaResult.subjectRows[subjId];
            const statusClass = getGwaStatusColorClass(row.statusTone);

            return (
              <div
                key={`mobile_gwa_${subjId}`}
                className="border border-slate-200/90 dark:border-[#22324D] rounded-lg p-3.5 bg-[#F8FAFC]/65 dark:bg-[#0F1A2C] space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-display font-semibold text-[#0F172A] dark:text-[#E6ECF5] leading-snug">
                      {row.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-[#9FB0C7] mt-0.5">
                      <span className="font-mono tabular-nums">{row.sourceLabel}</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-mono tabular-nums font-semibold shrink-0 ${
                      row.weightPercent === 40
                        ? 'text-[#8C4D11] dark:text-[#F2AE63]'
                        : 'text-slate-600 dark:text-[#9FB0C7]'
                    }`}
                  >
                    {row.weightPercent}% wt
                  </span>
                </div>

                <div className="flex items-end justify-between gap-3 pt-1.5 border-t border-slate-200/70 dark:border-[#22324D]">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-[#9FB0C7]">
                      Weighted
                    </div>
                    <div className="text-sm font-mono tabular-nums font-bold text-[#0D254C] dark:text-[#9CC0F9]">
                      {row.weightedContribution.toFixed(2)}%
                    </div>
                  </div>

                  <div className={`text-right text-xs ${statusClass}`}>
                    {row.statusLabel}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="rounded-lg p-3.5 bg-[#E6F4F4]/75 dark:bg-[#112A2D] border border-[#2E7978]/35 dark:border-[#2E7978]/60 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-[#143D3C] dark:text-[#68C7C5]">
                  General Weighted Average
                </div>
                <div className="font-mono tabular-nums text-xl font-bold text-[#0D254C] dark:text-[#9CC0F9] mt-0.5">
                  {gwaResult.gwa.toFixed(2)}%
                </div>
              </div>

              <div className="text-right text-xs max-w-[60%]">
                {!gwaResult.hasAnyProgress ? (
                  <span className="text-[#143D3C] dark:text-[#68C7C5] font-medium">
                    {gwaResult.targetVerdictLabel}
                  </span>
                ) : (
                  <span
                    className={`font-bold leading-snug ${
                      topnotcherMode
                        ? gwaResult.achievedTopnotcher
                          ? 'text-[#143D3C] dark:text-[#68C7C5]'
                          : gwaResult.passedOverall
                          ? 'text-[#8C4D11] dark:text-[#F2AE63]'
                          : 'text-rose-700 dark:text-rose-400'
                        : gwaResult.passedOverall
                        ? 'text-[#143D3C] dark:text-[#68C7C5]'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {(topnotcherMode
                      ? gwaResult.achievedTopnotcher || gwaResult.passedOverall
                      : gwaResult.passedOverall) ? (
                      <CheckCircle2 className="inline w-3.5 h-3.5 mr-1 -mt-0.5 align-middle" />
                    ) : (
                      <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5 align-middle" />
                    )}
                    <span>{gwaResult.targetVerdictLabel}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* DESKTOP 5-COLUMN AUTO-COMPUTED TABLE */}
        <div className="hidden sm:block p-6 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#293D5C] text-slate-500 dark:text-[#9FB0C7] font-medium">
                <th className="py-2.5 pr-4">Subject</th>
                <th className="py-2.5 px-4 text-right">Weight</th>
                <th className="py-2.5 px-4 text-right">Progress Basis</th>
                <th className="py-2.5 px-4 text-right">Weighted</th>
                <th className="py-2.5 pl-4 text-right">Benchmark Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#22324D]">
              {subjectIds.map((subjId) => {
                const row = gwaResult.subjectRows[subjId];
                const statusClass = getGwaStatusColorClass(row.statusTone);

                return (
                  <tr
                    key={subjId}
                    className="hover:bg-slate-50/70 dark:hover:bg-[#1A2942]/60"
                  >
                    <td className="py-3 pr-4 font-medium text-[#0F172A] dark:text-[#E6ECF5]">
                      {row.title}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                        row.weightPercent === 40
                          ? 'text-[#8C4D11] dark:text-[#F2AE63]'
                          : 'text-slate-600 dark:text-[#9FB0C7]'
                      }`}
                    >
                      {row.weightPercent}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-[#9FB0C7]">
                      {row.sourceLabel}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#0F172A] dark:text-[#E6ECF5]">
                      {row.weightedContribution.toFixed(2)}%
                    </td>
                    <td className={`py-3 pl-4 text-right ${statusClass}`}>
                      {row.statusLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#2E7978]/35 dark:border-[#2E7978]/60 bg-[#E6F4F4]/65 dark:bg-[#112A2D] font-semibold text-[#0F172A] dark:text-[#E6ECF5]">
                <td className="py-3 px-3 rounded-l">General Weighted Average</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">100%</td>
                <td className="py-3 px-4 text-right text-[#475569] dark:text-[#9FB0C7]">
                  Target{' '}
                  <span className="font-mono tabular-nums font-semibold">
                    {gwaResult.targetPercent.toFixed(1)}%
                  </span>
                </td>
                <td
                  data-testid="gwa-total-percent"
                  className="py-3 px-4 text-right font-mono tabular-nums text-base font-bold text-[#0D254C] dark:text-[#9CC0F9]"
                >
                  {gwaResult.gwa.toFixed(2)}%
                </td>
                <td className="py-3 pl-4 pr-3 text-right rounded-r">
                  {!gwaResult.hasAnyProgress ? (
                    <span className="text-[#143D3C] dark:text-[#68C7C5] font-medium">
                      {gwaResult.targetVerdictLabel}
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        topnotcherMode
                          ? gwaResult.achievedTopnotcher
                            ? 'text-[#143D3C] dark:text-[#68C7C5]'
                            : gwaResult.passedOverall
                            ? 'text-[#8C4D11] dark:text-[#F2AE63]'
                            : 'text-rose-700 dark:text-rose-400'
                          : gwaResult.passedOverall
                          ? 'text-[#143D3C] dark:text-[#68C7C5]'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {(topnotcherMode
                        ? gwaResult.achievedTopnotcher || gwaResult.passedOverall
                        : gwaResult.passedOverall) ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <AlertTriangle className="w-4 h-4" />
                      )}
                      <span>{gwaResult.targetVerdictLabel}</span>
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
};

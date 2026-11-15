import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  analyzeStrengthsAndWeaknesses,
  buildSectionMarimekkoData,
  formatThresholdPercent,
  MAX_TOPNOTCHER_TARGET_PERCENT,
  MIN_TOPNOTCHER_TARGET_PERCENT,
  normalizeTopnotcherThreshold,
  QuestionAttemptLog,
  SubjectId,
  ZERO_SUBJECT_GRADES,
} from '../utils/bleppLogic';
import { PRC_TOS_SUBJECTS } from '../data/tosData';

const SECTION_MEKKO_PALETTES: Record<
  SubjectId,
  {
    tabLabel: string;
    barFill: string;
    inBarText: string;
    inBarSubText: string;
    axisTitle: string;
    axisWeight: string;
  }
> = {
  psych_assessment: {
    tabLabel: 'Psych Assessment · 40%',
    barFill: 'fill-[#D9822B] dark:fill-[#DF8B35]',
    inBarText: 'fill-[#1C1208] dark:fill-[#140C04]',
    inBarSubText: 'fill-[#3B2006] dark:fill-[#2A1806]',
    axisTitle: 'fill-[#3B2006] dark:fill-[#FDE6C4]',
    axisWeight: 'fill-[#8C4D11] dark:fill-[#F2AE63]',
  },
  abnormal_psych: {
    tabLabel: 'Abnormal Psych · 20%',
    barFill: 'fill-[#246867] dark:fill-[#2B7A78]',
    inBarText: 'fill-white dark:fill-[#F8FAFC]',
    inBarSubText: 'fill-[#D5F2F1] dark:fill-[#CCFBF1]',
    axisTitle: 'fill-[#143D3C] dark:fill-[#D5F2F1]',
    axisWeight: 'fill-[#216463] dark:fill-[#68C7C5]',
  },
  dev_psych: {
    tabLabel: 'Dev Psych · 20%',
    barFill: 'fill-[#0D254C] dark:fill-[#2B5998]',
    inBarText: 'fill-white dark:fill-[#F8FAFC]',
    inBarSubText: 'fill-[#DCE6F5] dark:fill-[#CBD5E1]',
    axisTitle: 'fill-[#0D254C] dark:fill-[#E6F0FF]',
    axisWeight: 'fill-[#334155] dark:fill-[#9CC0F9]',
  },
  io_psych: {
    tabLabel: 'I/O Psych · 20%',
    barFill: 'fill-[#334155] dark:fill-[#4B607C]',
    inBarText: 'fill-white dark:fill-[#F8FAFC]',
    inBarSubText: 'fill-[#E2E8F0] dark:fill-[#CBD5E1]',
    axisTitle: 'fill-[#1E293B] dark:fill-[#F1F5F9]',
    axisWeight: 'fill-[#475569] dark:fill-[#CBD5E1]',
  },
};

const MEKKO_SUBJECT_TAB_ORDER: SubjectId[] = [
  'psych_assessment',
  'abnormal_psych',
  'dev_psych',
  'io_psych',
];

interface AnalyticsDashboardProps {
  attemptLogs: QuestionAttemptLog[];
  masteredCompetencies: Record<string, boolean>;
  topnotcherMode: boolean;
  topnotcherThreshold: number;
  onToggleTopnotcherMode: (nextValue?: boolean) => void;
  onUpdateTopnotcherThreshold: (nextThreshold: number) => void;
  onBackToHome: () => void;
  onClearLogs: () => void;
  onDrillTopic: (subjectId: SubjectId, sectionId: string) => void;
  onLoadAllOfficialBanks?: () => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  attemptLogs,
  masteredCompetencies,
  topnotcherMode,
  topnotcherThreshold,
  onToggleTopnotcherMode,
  onUpdateTopnotcherThreshold,
  onBackToHome,
  onClearLogs,
  onDrillTopic,
}) => {
  const [selectedMekkoSubject, setSelectedMekkoSubject] =
    useState<SubjectId>('psych_assessment');
  const [thresholdDraft, setThresholdDraft] = useState<string>(() =>
    formatThresholdPercent(topnotcherThreshold)
  );

  useEffect(() => {
    setThresholdDraft(formatThresholdPercent(topnotcherThreshold));
  }, [topnotcherThreshold]);

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

  const report = analyzeStrengthsAndWeaknesses(
    attemptLogs,
    PRC_TOS_SUBJECTS,
    ZERO_SUBJECT_GRADES,
    {
      topnotcherMode,
      topnotcherThreshold,
      ignoreManualGrades: true,
    }
  );

  const sectionMekko = buildSectionMarimekkoData(
    attemptLogs,
    PRC_TOS_SUBJECTS,
    ZERO_SUBJECT_GRADES,
    masteredCompetencies,
    selectedMekkoSubject,
    {
      topnotcherMode,
      topnotcherThreshold,
      ignoreManualGrades: true,
    }
  );
  const activeMekkoPalette = SECTION_MEKKO_PALETTES[selectedMekkoSubject];

  const topicsNeedingWork = [...report.weaknesses, ...report.developing];
  const targetLabelPct = topnotcherMode ? topnotcherThreshold : 75;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* MINIMALIST HEADER */}
      <section className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/90 dark:border-[#22324D] pb-4 sm:pb-5">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBackToHome}
            className="min-h-[34px] inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </button>
          <h1 className="text-xl sm:text-3xl font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
            Performance Analytics
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            role="group"
            aria-label="Performance Analytics benchmark mode"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0D1726] border border-slate-200/80 dark:border-[#22324D]"
          >
            <button
              type="button"
              aria-pressed={!topnotcherMode}
              onClick={() => onToggleTopnotcherMode(false)}
              className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                !topnotcherMode
                  ? 'bg-white text-[#0D254C] dark:bg-[#1B2B45] dark:text-[#F8FAFC] shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
              }`}
            >
              Standard · 75%
            </button>
            <button
              type="button"
              aria-pressed={topnotcherMode}
              onClick={() => onToggleTopnotcherMode(true)}
              className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
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
                  htmlFor="analytics-topnotcher-threshold"
                  className="sr-only"
                >
                  Analytics Topnotcher threshold percentage
                </label>
                <input
                  id="analytics-topnotcher-threshold"
                  type="number"
                  inputMode="decimal"
                  min={MIN_TOPNOTCHER_TARGET_PERCENT}
                  max={MAX_TOPNOTCHER_TARGET_PERCENT}
                  step="0.5"
                  aria-label="Analytics Topnotcher threshold percentage"
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

          {report.totalAttempts > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="min-h-[40px] sm:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2D3136] hover:bg-[#1E2226] dark:bg-[#1A2942] dark:hover:bg-[#243858] border border-[#2D3136] dark:border-[#293D5C] text-white dark:text-[#E6ECF5] text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset History</span>
            </button>
          )}
        </div>
      </section>

      {/* 4 CLEAN KPI CARDS — ONE PER GOOGLE STITCH PALETTE FAMILY */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Primary Academic Navy */}
        <div className="bg-[#EDF2FA] dark:bg-[#172844] border border-[#0D254C]/15 dark:border-[#2B436B] rounded-xl p-4 sm:p-5 space-y-1">
          <div className="text-xs font-medium text-[#0D254C] dark:text-[#9CC0F9]">Answered</div>
          <div className="text-xl sm:text-2xl font-mono tabular-nums font-bold text-[#0D254C] dark:text-[#F8FAFC]">
            {report.totalAttempts}
          </div>
          <div className="text-xs text-[#334155] dark:text-[#C5D2E3]">
            <span className="font-mono tabular-nums">{report.totalCorrect}</span> correct ·{' '}
            <span className="font-mono tabular-nums">{report.untestedTopicsCount}</span> untested
          </div>
        </div>

        {/* 2. Secondary Scholarly Teal */}
        <div className="bg-[#E6F4F4] dark:bg-[#112A2D] border border-[#2E7978]/30 dark:border-[#255959] rounded-xl p-4 sm:p-5 space-y-1">
          <div className="text-xs font-medium text-[#143D3C] dark:text-[#68C7C5]">Accuracy</div>
          <div
            className={`text-xl sm:text-2xl font-mono tabular-nums font-bold ${
              report.totalAttempts === 0
                ? 'text-[#143D3C] dark:text-[#D5F2F1]'
                : report.overallAccuracyPercent >= targetLabelPct
                ? 'text-[#143D3C] dark:text-[#68C7C5]'
                : report.overallAccuracyPercent >= (topnotcherMode ? 75 : 60)
                ? 'text-[#8C4D11] dark:text-[#F2AE63]'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {report.totalAttempts === 0 ? '—' : `${report.overallAccuracyPercent}%`}
          </div>
          <div className="text-xs text-[#1E5655] dark:text-[#B8E6E5]">
            {topnotcherMode
              ? `${topnotcherThreshold.toFixed(1)}% topnotcher target`
              : '75.0% target'}
          </div>
        </div>

        {/* 3. Neutral Slate Surface */}
        <div className="bg-[#ECEFF3] dark:bg-[#1A2942] border border-slate-300/80 dark:border-[#293D5C] rounded-xl p-4 sm:p-5 space-y-1 min-w-0">
          <div className="text-xs font-medium text-[#2D3136] dark:text-[#CBD5E1]">
            Strongest Subject
          </div>
          <div className="text-sm sm:text-base font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC] truncate">
            {report.strongestSubject ? report.strongestSubject.subjectTitle : '—'}
          </div>
          <div
            className={`text-xs font-mono tabular-nums font-semibold ${
              report.strongestSubject
                ? 'text-[#22605F] dark:text-[#68C7C5]'
                : 'text-[#475569] dark:text-[#9FB0C7]'
            }`}
          >
            {report.strongestSubject
              ? `${report.strongestSubject.accuracyPercent}%`
              : `None ≥${formatThresholdPercent(targetLabelPct)}% yet`}
          </div>
        </div>

        {/* 4. Tertiary Warm Ochre & Deep Umber */}
        <div className="bg-[#FDF3E7] dark:bg-[#2A1C10] border border-[#D9822B]/40 dark:border-[#7A4715] rounded-xl p-4 sm:p-5 space-y-1 min-w-0">
          <div className="text-xs font-medium text-[#8C4D11] dark:text-[#F2AE63]">Needs Focus</div>
          <div className="text-sm sm:text-base font-display font-semibold text-[#3B2006] dark:text-[#F7DEC2] truncate">
            {report.weakestSubject ? report.weakestSubject.subjectTitle : '—'}
          </div>
          <div
            className={`text-xs font-mono tabular-nums font-semibold ${
              report.weakestSubject
                ? topnotcherMode && report.weakestSubject.accuracyPercent >= 75
                  ? 'text-[#8C4D11] dark:text-[#F2AE63]'
                  : 'text-rose-700 dark:text-rose-400'
                : 'text-[#6B3B0D] dark:text-[#F2AE63]'
            }`}
          >
            {report.weakestSubject
              ? `${report.weakestSubject.accuracyPercent}% (${report.weakestSubject.boardWeightPercent}% wt)`
              : report.totalAttempts > 0
              ? `All ≥${formatThresholdPercent(targetLabelPct)}%`
              : 'No data yet'}
          </div>
        </div>
      </section>

      {/* SECTION-LEVEL MARIMEKKO (WEIGHT × ACCURACY) BREAKDOWN */}
      <section className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-slate-200/80 dark:border-[#22324D] pb-4">
          <div className="space-y-1">
            <h2 className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
              Section Breakdown
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-[#9FB0C7]">
              <span>{sectionMekko.subjectTitle}</span>
              <span aria-hidden="true">·</span>
              <span>{sectionMekko.subjectBoardWeightPercent}% Weight</span>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Select subject for section weight breakdown"
            className="grid grid-cols-2 sm:flex w-full sm:w-auto items-center gap-1 p-1 bg-slate-100 dark:bg-[#0D1726] border border-slate-200/80 dark:border-[#22324D] rounded-lg"
          >
            {MEKKO_SUBJECT_TAB_ORDER.map((subjId) => {
              const isActive = selectedMekkoSubject === subjId;
              return (
                <button
                  key={subjId}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSelectedMekkoSubject(subjId)}
                  className={`min-h-[38px] sm:min-h-0 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate text-center ${
                    isActive
                      ? 'bg-white dark:bg-[#1B2B45] text-[#0D254C] dark:text-[#F8FAFC] shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
                  }`}
                >
                  {SECTION_MEKKO_PALETTES[subjId].tabLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${sectionMekko.viewBoxWidth} ${sectionMekko.viewBoxHeight}`}
            role="img"
            aria-label={`Section weight-by-score Marimekko chart for ${sectionMekko.subjectTitle}`}
            className="w-full sm:min-w-[540px] h-auto select-none overflow-visible"
          >
            {sectionMekko.yTicks.map((tick) => {
              const isTopTick =
                topnotcherMode && tick.percent === sectionMekko.topnotcherTargetPercent;
              const isThreshold =
                isTopTick ||
                tick.percent === 75 ||
                tick.percent === 50;
              return (
                <g key={`sec_ytick_${tick.percent}`}>
                  {!isThreshold && (
                    <line
                      x1={sectionMekko.plotLeft}
                      y1={tick.y}
                      x2={sectionMekko.plotRight}
                      y2={tick.y}
                      strokeWidth="1"
                      className="stroke-slate-200/80 dark:stroke-[#22324D]"
                    />
                  )}
                  <text
                    x={sectionMekko.plotLeft - 8}
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

            {sectionMekko.columns.map((col) => {
              const showInside = col.attempts > 0 && col.barHeight >= 26;

              return (
                <g
                  key={col.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Practice Section ${col.sectionLetter}: ${col.sectionTitle}, ${col.weightPercent}% weight, ${
                    col.attempts === 0
                      ? 'untested'
                      : `${col.currentPercent}%`
                  }`}
                  onClick={() => onDrillTopic(col.subjectId, col.sectionId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onDrillTopic(col.subjectId, col.sectionId);
                    }
                  }}
                  className="cursor-pointer hover:opacity-92 transition-opacity duration-150 focus:outline-none"
                >
                  <title>{`Section ${col.sectionLetter}. ${col.sectionTitle} (${col.weightPercent}%) — ${
                    col.attempts === 0
                      ? 'Untested'
                      : `${col.currentPercent}%`
                  }`}</title>

                  <rect
                    x={col.x}
                    y={col.trackY}
                    width={col.width}
                    height={col.trackHeight}
                    rx={4}
                    strokeWidth={1}
                    className="fill-slate-100/90 dark:fill-[#0D1726] stroke-slate-200/95 dark:stroke-[#22324D]"
                  />

                  {col.deficitHeight > 0 && col.attempts > 0 && (
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
                      className={activeMekkoPalette.barFill}
                    />
                  )}

                  {showInside ? (
                    <text
                      x={col.centerX}
                      y={sectionMekko.plotBottom - 10}
                      textAnchor="middle"
                      fontSize={col.width >= 60 ? '11.5' : '9.5'}
                      fontWeight="700"
                      className={`pointer-events-none font-mono ${activeMekkoPalette.inBarText}`}
                    >
                      {`${col.currentPercent.toFixed(0)}%`}
                    </text>
                  ) : (
                    <text
                      x={col.centerX}
                      y={Math.min(sectionMekko.plotBottom - 9, col.barY - 7)}
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="600"
                      className="pointer-events-none font-mono fill-slate-500 dark:fill-[#9FB0C7]"
                    >
                      {col.attempts === 0 ? '—' : `${col.currentPercent.toFixed(0)}%`}
                    </text>
                  )}

                  <text
                    x={col.centerX}
                    y={sectionMekko.plotBottom + 18}
                    textAnchor="middle"
                    className="font-sans"
                  >
                    <tspan
                      x={col.centerX}
                      fontSize={col.width < 46 ? '9.5' : '10.5'}
                      fontWeight={col.weightPercent >= 30 ? '700' : '600'}
                      className={activeMekkoPalette.axisTitle}
                    >
                      {col.shortLabel}
                    </tspan>
                    <tspan
                      x={col.centerX}
                      dy="1.3em"
                      fontSize="9.5"
                      fontWeight={col.weightPercent >= 30 ? '700' : '600'}
                      className={`font-mono ${activeMekkoPalette.axisWeight}`}
                    >
                      {`${col.weightPercent}%`}
                    </tspan>
                  </text>
                </g>
              );
            })}

            {/* 50% Cutoff Dotted Line */}
            <line
              x1={sectionMekko.plotLeft}
              y1={sectionMekko.cutoffLineY}
              x2={sectionMekko.plotRight}
              y2={sectionMekko.cutoffLineY}
              strokeWidth="3.2"
              className="stroke-white/80 dark:stroke-[#0B1320]/80 pointer-events-none"
            />
            <line
              x1={sectionMekko.plotLeft}
              y1={sectionMekko.cutoffLineY}
              x2={sectionMekko.plotRight}
              y2={sectionMekko.cutoffLineY}
              strokeWidth="1.65"
              strokeDasharray="3 4.5"
              className="stroke-rose-600 dark:stroke-rose-400 pointer-events-none"
            />

            {/* 75% Passing Dashed Line */}
            <line
              x1={sectionMekko.plotLeft}
              y1={sectionMekko.passingLineY}
              x2={sectionMekko.plotRight}
              y2={sectionMekko.passingLineY}
              strokeWidth={topnotcherMode ? '3' : '3.6'}
              className="stroke-white/85 dark:stroke-[#0B1320]/85 pointer-events-none"
            />
            <line
              x1={sectionMekko.plotLeft}
              y1={sectionMekko.passingLineY}
              x2={sectionMekko.plotRight}
              y2={sectionMekko.passingLineY}
              strokeWidth={topnotcherMode ? '1.6' : '2.1'}
              strokeDasharray="7 5"
              className="stroke-[#0D254C] dark:stroke-[#5EEAD4] pointer-events-none"
            />

            {/* 85% Topnotcher Benchmark Line */}
            {topnotcherMode && (
              <>
                <line
                  x1={sectionMekko.plotLeft}
                  y1={sectionMekko.topnotcherLineY}
                  x2={sectionMekko.plotRight}
                  y2={sectionMekko.topnotcherLineY}
                  strokeWidth="3.6"
                  className="stroke-white/85 dark:stroke-[#0B1320]/85 pointer-events-none"
                />
                <line
                  x1={sectionMekko.plotLeft}
                  y1={sectionMekko.topnotcherLineY}
                  x2={sectionMekko.plotRight}
                  y2={sectionMekko.topnotcherLineY}
                  strokeWidth="2.2"
                  strokeDasharray="8 4"
                  className="stroke-[#D9822B] dark:stroke-[#F2AE63] pointer-events-none"
                />
              </>
            )}
          </svg>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-[#22324D] flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-[#9FB0C7]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {topnotcherMode && (
              <>
                <span className="inline-flex items-center gap-2 font-semibold text-[#8C4D11] dark:text-[#F2AE63]">
                  <svg width="20" height="6" aria-hidden="true">
                    <line
                      x1="0"
                      y1="3"
                      x2="20"
                      y2="3"
                      strokeWidth="2.2"
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
                  strokeWidth="2.1"
                  strokeDasharray="5 4"
                  className="stroke-[#0D254C] dark:stroke-[#5EEAD4]"
                />
              </svg>
              <span>75% Passing Line</span>
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
                  strokeWidth="1.65"
                  strokeDasharray="2.5 3.5"
                  className="stroke-rose-600 dark:stroke-rose-400"
                />
              </svg>
              <span>50% Cutoff</span>
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <span>Column Width = Official Syllabus Section Weight</span>
          </div>
          <span className="font-medium text-[#0D254C] dark:text-[#9CC0F9]">
            Click any section column to practice
          </span>
        </div>
      </section>

      {/* WEAKNESSES / TOPNOTCHER PUSH vs STRENGTHS */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        <div className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#D9822B]/30 dark:border-[#7A4715] pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#8C4D11] dark:text-[#F2AE63]" />
              <h2 className="text-lg font-display font-semibold text-[#3B2006] dark:text-[#F7DEC2]">
                {topnotcherMode
                  ? `Topnotcher Push (<${fmtTopThreshold}%)`
                  : 'Needs Work (<75%)'}
              </h2>
            </div>
            <span className="text-xs font-mono tabular-nums font-semibold text-[#8C4D11] dark:text-[#F2AE63]">
              {topicsNeedingWork.length}
            </span>
          </div>

          {topicsNeedingWork.length === 0 ? (
            <p className="py-6 text-xs text-slate-500 dark:text-[#9FB0C7]">
              {report.totalAttempts === 0
                ? 'Answer practice or mock questions to diagnose weak areas.'
                : topnotcherMode
                ? `All tested sections are at ${fmtTopThreshold}% or above.`
                : 'All tested sections are at 75% or above.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#22324D]">
              {topicsNeedingWork.map((topic) => (
                <div
                  key={topic.key}
                  className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 sm:gap-4"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-[#9FB0C7]">
                      {topic.subjectTitle} · {topic.boardWeightPercent}%
                    </div>
                    <div className="text-sm font-semibold text-[#0F172A] dark:text-[#E6ECF5] line-clamp-2 sm:truncate">
                      Sec {topic.sectionLetter}. {topic.sectionTitle}
                    </div>
                    <div
                      className={`text-xs font-mono tabular-nums font-semibold mt-0.5 ${
                        topic.status === 'WEAKNESS'
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-[#8C4D11] dark:text-[#F2AE63]'
                      }`}
                    >
                      {topic.accuracyPercent}% ({topic.correct}/{topic.attempts})
                      {topnotcherMode && topic.accuracyPercent >= 75
                        ? ` · +${Math.max(
                            0,
                            topnotcherThreshold - topic.accuracyPercent
                          ).toFixed(1)}% to ${fmtTopThreshold}%`
                        : ''}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDrillTopic(topic.subjectId, topic.sectionId)}
                    className="min-h-[38px] sm:min-h-0 inline-flex items-center gap-1 px-3.5 py-2 sm:py-1.5 bg-[#3B2006] hover:bg-[#522D0A] dark:bg-[#D9822B] dark:hover:bg-[#E5923D] text-white dark:text-[#1C1208] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>
                      {topnotcherMode && topic.accuracyPercent >= 75
                        ? `Push to ${fmtTopThreshold}%`
                        : 'Practice'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#22324D] pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#2E7978] dark:text-[#68C7C5]" />
              <h2 className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
                {topnotcherMode
                  ? `Topnotcher Strengths (≥${fmtTopThreshold}%)`
                  : 'Strengths (≥75%)'}
              </h2>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-[#9FB0C7]">
              {report.strengths.length}
            </span>
          </div>

          {report.strengths.length === 0 ? (
            <p className="py-6 text-xs text-slate-500 dark:text-[#9FB0C7]">
              {report.totalAttempts === 0
                ? 'Complete a quiz to track mastered sections.'
                : topnotcherMode
                ? `Keep practicing to reach ≥${fmtTopThreshold}% Topnotcher mastery.`
                : 'Keep practicing to reach ≥75% mastery.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#22324D]">
              {report.strengths.map((topic) => (
                <div
                  key={topic.key}
                  className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 sm:gap-4"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-slate-500 dark:text-[#9FB0C7]">
                      {topic.subjectTitle} · {topic.boardWeightPercent}%
                    </div>
                    <div className="text-sm font-semibold text-[#0F172A] dark:text-[#E6ECF5] line-clamp-2 sm:truncate">
                      Sec {topic.sectionLetter}. {topic.sectionTitle}
                    </div>
                  </div>
                  <div className="font-mono text-sm font-bold text-[#22605F] dark:text-[#68C7C5] shrink-0">
                    {topic.accuracyPercent}% ({topic.correct}/{topic.attempts})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* COMPACT COGNITIVE TIERS (STITCH 3-TRACK BAR PALETTE) */}
      <section className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-4 sm:p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
          Bloom&apos;s Difficulty Breakdown
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 tabular-nums">
          {report.bloomsStats.map((b, idx) => {
            const barFillClass =
              idx === 0
                ? 'bg-[#0D254C] dark:bg-[#9CC0F9]'
                : idx === 1
                ? 'bg-[#2E7978] dark:bg-[#68C7C5]'
                : 'bg-[#3B2006] dark:bg-[#D9822B]';
            return (
              <div
                key={b.tier}
                className="border border-slate-200 dark:border-[#293D5C] bg-[#F8FAFC] dark:bg-[#1A2942]/65 rounded-lg p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[#0F172A] dark:text-[#E6ECF5]">
                      {b.tier}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-[#9FB0C7] font-mono">
                      {b.boardSharePercent}% of exam
                    </div>
                  </div>
                  <div className="font-mono text-sm font-bold text-[#0D254C] dark:text-[#9CC0F9]">
                    {b.attempts === 0
                      ? '—'
                      : `${b.accuracyPercent}% (${b.correct}/${b.attempts})`}
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="h-1.5 w-full rounded-full bg-[#ECEFF3] dark:bg-[#0B1320] overflow-hidden"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barFillClass}`}
                    style={{ width: `${b.attempts === 0 ? 0 : b.accuracyPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* COLLAPSIBLE ALL-SECTIONS BREAKDOWN — STACKED MOBILE CARDS + DESKTOP TABLE */}
      <details className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl p-4 sm:p-6 group">
        <summary className="min-h-[36px] cursor-pointer list-none flex items-center justify-between text-base font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
          <span>All {report.allTopicStats.length} Syllabus Sections</span>
          <span className="text-xs font-label font-medium text-[#22605F] dark:text-[#68C7C5]">
            Show / Hide
          </span>
        </summary>

        {/* MOBILE STACKED SECTION ROWS (ZERO SIDE-SCROLL) */}
        <div className="md:hidden mt-4 pt-3 border-t border-slate-100 dark:border-[#22324D] divide-y divide-slate-100 dark:divide-[#22324D] tabular-nums">
          {report.allTopicStats.map((topic) => {
            const subj = PRC_TOS_SUBJECTS[topic.subjectId];
            const sec = subj.sections.find((s) => s.id === topic.sectionId);
            const totalComps = sec ? sec.competencies.length : 0;
            const doneComps = sec
              ? sec.competencies.filter((c) => masteredCompetencies[c.id]).length
              : 0;

            return (
              <div
                key={`mobile_sec_${topic.key}`}
                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="text-[11px] font-mono text-slate-500 dark:text-[#9FB0C7]">
                    {subj.shortTitle} · {topic.boardWeightPercent}% · {doneComps}/{totalComps} goals
                  </div>
                  <div className="text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#E6ECF5] leading-snug">
                    {topic.sectionLetter}. {topic.sectionTitle}
                  </div>
                  <div className="text-xs font-mono font-semibold text-[#0D254C] dark:text-[#9CC0F9]">
                    {topic.attempts === 0
                      ? 'Untested'
                      : `${topic.accuracyPercent}% (${topic.correct}/${topic.attempts})`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDrillTopic(topic.subjectId, topic.sectionId)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#EDF2FA] dark:bg-[#1A2942] text-[#0D254C] dark:text-[#9CC0F9] text-xs font-semibold shrink-0"
                >
                  Practice
                </button>
              </div>
            );
          })}
        </div>

        {/* DESKTOP 6-COLUMN TABLE */}
        <div className="hidden md:block overflow-x-auto mt-4 pt-4 border-t border-slate-100 dark:border-[#22324D]">
          <table className="w-full text-left border-collapse text-xs tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#293D5C] text-slate-500 dark:text-[#9FB0C7] font-medium">
                <th className="py-2 pr-4">Subject</th>
                <th className="py-2 px-3">Section</th>
                <th className="py-2 px-3 text-right">Weight</th>
                <th className="py-2 px-3 text-right">Mastered</th>
                <th className="py-2 px-3 text-right">Accuracy</th>
                <th className="py-2 pl-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#22324D]">
              {report.allTopicStats.map((topic) => {
                const subj = PRC_TOS_SUBJECTS[topic.subjectId];
                const sec = subj.sections.find((s) => s.id === topic.sectionId);
                const totalComps = sec ? sec.competencies.length : 0;
                const doneComps = sec
                  ? sec.competencies.filter((c) => masteredCompetencies[c.id]).length
                  : 0;

                return (
                  <tr key={topic.key} className="hover:bg-slate-50/70 dark:hover:bg-[#1A2942]/60">
                    <td className="py-2.5 pr-4 text-slate-600 dark:text-[#9FB0C7]">{subj.shortTitle}</td>
                    <td className="py-2.5 px-3 font-medium text-[#0F172A] dark:text-[#E6ECF5]">
                      {topic.sectionLetter}. {topic.sectionTitle}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-[#9FB0C7]">
                      {topic.boardWeightPercent}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-[#9FB0C7]">
                      {doneComps}/{totalComps}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#0F172A] dark:text-[#E6ECF5]">
                      {topic.attempts === 0
                        ? '—'
                        : `${topic.accuracyPercent}% (${topic.correct}/${topic.attempts})`}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => onDrillTopic(topic.subjectId, topic.sectionId)}
                        className="text-[#0D254C] dark:text-[#9CC0F9] hover:underline font-medium"
                      >
                        Practice
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};

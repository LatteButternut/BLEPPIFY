import React from 'react';
import { ArrowRight, BookOpen, RotateCcw, X } from 'lucide-react';
import { ResumableSessionInfo } from '../utils/bleppLogic';

interface ContinueSessionBarProps {
  sessions: ResumableSessionInfo[];
  onResume: (session: ResumableSessionInfo) => void;
  onDiscard: (session: ResumableSessionInfo) => void;
  onDismiss: (session: ResumableSessionInfo) => void;
}

export const ContinueSessionBar: React.FC<ContinueSessionBarProps> = ({
  sessions,
  onResume,
  onDiscard,
  onDismiss,
}) => {
  if (sessions.length === 0) return null;

  const primary = sessions[0];
  const modeLabel = primary.mode === 'mock' ? 'Mock Exam' : 'Quiz';

  return (
    <section
      aria-label="Saved exam or quiz progress"
      className="mb-5 sm:mb-6 bg-white dark:bg-[#131F33] border border-[#2E7978]/35 dark:border-[#2E7978]/60 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs no-print transition-colors"
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-700 dark:text-[#9FB0C7] min-w-0">
          <BookOpen className="w-3.5 h-3.5 text-[#2E7978] dark:text-[#68C7C5] shrink-0" />
          <span className="font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
            {primary.subjectTitle} {modeLabel}
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
          <span className="font-mono text-slate-600 dark:text-[#9FB0C7]">{primary.summaryText}</span>
          {sessions.length > 1 && (
            <span className="font-mono text-[11px] text-slate-500 dark:text-[#9FB0C7]">
              (+{sessions.length - 1} more saved)
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(primary)}
          aria-label="Hide resume prompt"
          className="sm:hidden min-w-[32px] min-h-[32px] -mr-1 -mt-1 inline-flex items-center justify-center text-[#475569] dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white rounded transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
        <button
          type="button"
          onClick={() => onResume(primary)}
          className="flex-1 sm:flex-initial min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-1.5 bg-[#2E7978] hover:bg-[#246160] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
        >
          <span>Continue {modeLabel}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onDiscard(primary)}
          aria-label={`Discard saved ${primary.subjectTitle} ${modeLabel}`}
          className="min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1 px-3 sm:px-2.5 py-2 sm:py-1.5 text-xs font-medium text-slate-500 dark:text-[#9FB0C7] hover:text-rose-700 dark:hover:text-rose-400 rounded-lg transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Discard</span>
        </button>

        <button
          type="button"
          onClick={() => onDismiss(primary)}
          aria-label="Hide resume prompt"
          className="hidden sm:inline-flex p-1 text-[#475569] dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
};

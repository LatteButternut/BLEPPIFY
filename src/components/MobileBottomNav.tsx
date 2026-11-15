import React, { useEffect } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  Home,
  Layers,
  User,
  X,
} from 'lucide-react';
import { PRC_TOS_SUBJECTS } from '../data/tosData';
import { SubjectId } from '../utils/bleppLogic';

interface MobileBottomNavProps {
  activeTab: 'overview' | 'analytics' | 'profile' | SubjectId;
  lastVisitedSubjectId: SubjectId;
  masteredCompetencies: Record<string, boolean>;
  isSubjectSheetOpen: boolean;
  onToggleSubjectSheet: (open?: boolean) => void;
  onSelectOverview: () => void;
  onSelectAnalytics: () => void;
  onSelectProfile: () => void;
  onSelectSubject: (subjectId: SubjectId) => void;
}

const SUBJECT_ORDER: SubjectId[] = [
  'psych_assessment',
  'abnormal_psych',
  'dev_psych',
  'io_psych',
];

const SUBJECT_SHEET_STYLES: Record<
  SubjectId,
  {
    accentDot: string;
    activeBorder: string;
    activeBg: string;
  }
> = {
  psych_assessment: {
    accentDot: 'bg-[#D9822B] dark:bg-[#F2AE63]',
    activeBorder: 'border-[#D9822B]/60 dark:border-[#F2AE63]/60',
    activeBg: 'bg-[#FDF3E7]/80 dark:bg-[#2A1C10]',
  },
  abnormal_psych: {
    accentDot: 'bg-[#2E7978] dark:bg-[#68C7C5]',
    activeBorder: 'border-[#2E7978]/60 dark:border-[#68C7C5]/60',
    activeBg: 'bg-[#E6F4F4]/80 dark:bg-[#112A2D]',
  },
  dev_psych: {
    accentDot: 'bg-[#0D254C] dark:bg-[#9CC0F9]',
    activeBorder: 'border-[#0D254C]/50 dark:border-[#9CC0F9]/60',
    activeBg: 'bg-[#EDF2FA]/85 dark:bg-[#172844]',
  },
  io_psych: {
    accentDot: 'bg-[#334155] dark:bg-[#CBD5E1]',
    activeBorder: 'border-slate-400 dark:border-[#CBD5E1]/50',
    activeBg: 'bg-[#ECEFF3] dark:bg-[#1C283B]',
  },
};

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  lastVisitedSubjectId,
  masteredCompetencies,
  isSubjectSheetOpen,
  onToggleSubjectSheet,
  onSelectOverview,
  onSelectAnalytics,
  onSelectProfile,
  onSelectSubject,
}) => {
  const isInsideSubject =
    activeTab !== 'overview' &&
    activeTab !== 'analytics' &&
    activeTab !== 'profile';
  const activeOrLastSubject = isInsideSubject ? activeTab : lastVisitedSubjectId;

  useEffect(() => {
    if (!isSubjectSheetOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onToggleSubjectSheet(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubjectSheetOpen, onToggleSubjectSheet]);

  return (
    <>
      {/* SLIDE-UP 4-SUBJECT SWITCHER SHEET (MOBILE ONLY) */}
      {isSubjectSheetOpen && (
        <div className="md:hidden no-print">
          <div
            aria-hidden="true"
            onClick={() => onToggleSubjectSheet(false)}
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] transition-opacity"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Switch BLEPP board subject"
            className="fixed left-0 right-0 bottom-14 z-50 bg-white dark:bg-[#131F33] border-t border-slate-200 dark:border-[#22324D] rounded-t-2xl shadow-2xl px-4 pt-2.5 pb-4 space-y-3"
          >
            <div
              aria-hidden="true"
              className="w-10 h-1 bg-slate-300 dark:bg-[#293D5C] rounded-full mx-auto"
            />
            <div className="flex items-center justify-between">
              <span className="text-sm font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
                Board Subjects
              </span>
              <button
                type="button"
                onClick={() => onToggleSubjectSheet(false)}
                aria-label="Close subject switcher"
                className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {SUBJECT_ORDER.map((subjId) => {
                const subj = PRC_TOS_SUBJECTS[subjId];
                const style = SUBJECT_SHEET_STYLES[subjId];
                const isSelected = activeTab === subjId;

                let totalComp = 0;
                let masteredComp = 0;
                subj.sections.forEach((sec) => {
                  sec.competencies.forEach((c) => {
                    totalComp++;
                    if (masteredCompetencies[c.id]) masteredComp++;
                  });
                });

                return (
                  <button
                    key={subjId}
                    type="button"
                    onClick={() => {
                      onSelectSubject(subjId);
                      onToggleSubjectSheet(false);
                    }}
                    className={`w-full min-h-[56px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors active:scale-[0.99] ${
                      isSelected
                        ? `${style.activeBg} ${style.activeBorder}`
                        : 'bg-[#F8FAFC] dark:bg-[#0F1A2C] border-slate-200/90 dark:border-[#22324D] hover:border-slate-300 dark:hover:border-[#334663]'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`w-2 h-2 rounded-full shrink-0 ${style.accentDot}`}
                        />
                        <span className="text-sm font-display font-semibold text-[#0F172A] dark:text-[#F8FAFC] truncate">
                          {subj.fullTitle}
                        </span>
                      </div>
                      <div className="pl-4 text-xs font-mono tabular-nums text-slate-600 dark:text-[#9FB0C7]">
                        {subj.weightPercent}% Weight · {masteredComp}/{totalComp} Mastered
                      </div>
                    </div>

                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0D254C] dark:text-[#9CC0F9] shrink-0">
                        <Check className="w-4 h-4" />
                      </span>
                    ) : (
                      <ArrowRight className="w-4 h-4 text-slate-400 dark:text-[#9FB0C7] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* COMPACT FIXED BOTTOM NAVIGATION BAR (<= 56px = ~6.6% OF MOBILE VIEWPORT) */}
      <nav
        aria-label="Mobile primary navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#131F33]/95 backdrop-blur-md border-t border-slate-200/90 dark:border-[#22324D] pb-[env(safe-area-inset-bottom)] no-print transition-colors"
      >
        <div className="grid grid-cols-5 items-center h-14 px-1">
          <button
            type="button"
            onClick={() => {
              onToggleSubjectSheet(false);
              onSelectOverview();
            }}
            aria-current={activeTab === 'overview' && !isSubjectSheetOpen ? 'page' : undefined}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'overview' && !isSubjectSheetOpen
                ? 'text-[#0D254C] dark:text-[#9CC0F9] font-semibold'
                : 'text-slate-500 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[11px] leading-none">Home</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleSubjectSheet()}
            aria-expanded={isSubjectSheetOpen}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors whitespace-nowrap ${
              isSubjectSheetOpen
                ? 'text-[#D9822B] dark:text-[#F2AE63] font-semibold'
                : 'text-slate-500 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
            }`}
          >
            <Layers className="w-5 h-5" />
            <span className="text-[11px] leading-none">Subjects</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onToggleSubjectSheet(false);
              onSelectSubject(activeOrLastSubject);
            }}
            aria-current={isInsideSubject && !isSubjectSheetOpen ? 'page' : undefined}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors whitespace-nowrap ${
              isInsideSubject && !isSubjectSheetOpen
                ? 'text-[#2E7978] dark:text-[#68C7C5] font-semibold'
                : 'text-slate-500 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-[11px] leading-none">Study</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onToggleSubjectSheet(false);
              onSelectAnalytics();
            }}
            aria-current={activeTab === 'analytics' && !isSubjectSheetOpen ? 'page' : undefined}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'analytics' && !isSubjectSheetOpen
                ? 'text-[#0D254C] dark:text-[#9CC0F9] font-semibold'
                : 'text-slate-500 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[11px] leading-none">Analytics</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onToggleSubjectSheet(false);
              onSelectProfile();
            }}
            aria-current={activeTab === 'profile' && !isSubjectSheetOpen ? 'page' : undefined}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'profile' && !isSubjectSheetOpen
                ? 'text-[#2E7978] dark:text-[#68C7C5] font-semibold'
                : 'text-slate-500 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[11px] leading-none">Profile</span>
          </button>
        </div>
      </nav>
    </>
  );
};

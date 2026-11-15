import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import {
  calculateExamCountdown,
  formatDateInputValue,
  getSuggestedExamDates,
  parseLocalExamDate,
} from '../utils/bleppLogic';

interface ExamDateSetupScreenProps {
  isDark: boolean;
  initialDate?: string | null;
  userEmail?: string | null;
  onToggleTheme: () => void;
  onSignOut: () => void;
  onConfirmExamDate: (examDate: string) => void;
  onCancel?: () => void;
}

export const ExamDateSetupScreen: React.FC<ExamDateSetupScreenProps> = ({
  isDark,
  initialDate,
  userEmail,
  onToggleTheme,
  onSignOut,
  onConfirmExamDate,
  onCancel,
}) => {
  const [dateValue, setDateValue] = useState<string>(() => initialDate || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!dateValue) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [dateValue]);

  const presets = useMemo(() => getSuggestedExamDates(), []);
  const minTodayStr = useMemo(() => formatDateInputValue(new Date()), []);
  const previewCountdown = useMemo(
    () => calculateExamCountdown(dateValue, nowMs),
    [dateValue, nowMs]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = parseLocalExamDate(dateValue);
    if (!parsed) {
      setErrorMsg('Please choose your target BLEPP exam date before continuing.');
      return;
    }

    onConfirmExamDate(formatDateInputValue(parsed));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B1320] text-[#0F172A] dark:text-[#E6ECF5] transition-colors">
      {/* TOP STITCH RIBBON & HEADER */}
      <header className="bg-white dark:bg-[#131F33] border-b border-slate-200/90 dark:border-[#22324D] transition-colors">
        <div aria-hidden="true" className="h-1 w-full grid grid-cols-3">
          <div className="bg-[#0D254C] dark:bg-[#234B82]" />
          <div className="bg-[#2E7978] dark:bg-[#2E7978]" />
          <div className="bg-[#D9822B] dark:bg-[#D9822B]" />
        </div>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <span className="text-lg sm:text-xl font-display font-bold tracking-tight text-[#0D254C] dark:text-[#F8FAFC] whitespace-nowrap shrink-0">
            BLEPPIFY
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 sm:p-2 rounded-lg border border-[#D9822B]/55 dark:border-[#9A5B1E] bg-[#FDF3E7] dark:bg-[#2C1D10] hover:bg-[#FAE6CE] dark:hover:bg-[#3A2615] text-[#3B2006] dark:text-[#F2AE63] transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              title={userEmail ? `Signed in as ${userEmail} — Sign out` : 'Sign out'}
              className="inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 sm:px-3 sm:py-2 rounded-lg border border-slate-200 dark:border-[#293D5C] bg-[#F8FAFC] dark:bg-[#1A2942] hover:bg-slate-100 dark:hover:bg-[#243858] text-xs font-semibold text-[#0D254C] dark:text-[#E6ECF5] transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* CENTERED EXAM DATE SETUP CARD */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[480px] bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-2xl shadow-sm overflow-hidden transition-colors">
          <div className="px-6 pt-6 pb-5 bg-[#EDF2FA]/70 dark:bg-[#172844] border-b border-slate-200/80 dark:border-[#22324D]">
            <div className="text-xs font-medium text-[#2E7978] dark:text-[#68C7C5]">
              Board Exam Schedule
            </div>
            <h1 className="text-2xl font-display font-bold text-[#0D254C] dark:text-[#F8FAFC] tracking-tight mt-1 [text-wrap:balance]">
              When is your BLEPP exam?
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-[#9FB0C7] mt-1.5 leading-relaxed">
              Choose your target board examination date so your homescreen displays a live countdown down to the second.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/45 border border-rose-200 dark:border-rose-800/80 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="blepp-exam-date"
                className="block text-xs font-semibold text-[#0F172A] dark:text-[#E6ECF5]"
              >
                Target BLEPP Exam Date
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-[#0D254C] dark:text-[#9CC0F9] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="blepp-exam-date"
                  type="date"
                  required
                  min={minTodayStr}
                  value={dateValue}
                  onChange={(e) => {
                    setDateValue(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="w-full min-h-[46px] pl-10 pr-3.5 py-2 text-base sm:text-sm font-mono font-semibold tabular-nums bg-[#F8FAFC] dark:bg-[#0F1A2C] text-[#0F172A] dark:text-[#F8FAFC] border border-slate-300 dark:border-[#293D5C] rounded-lg focus:border-[#0D254C] dark:focus:border-[#9CC0F9] focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* QUICK SCHEDULE SHORTCUTS */}
            <div className="space-y-2">
              <div className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                Quick select schedule
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {presets.map((preset) => {
                  const isSelected = dateValue === preset.dateStr;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setDateValue(preset.dateStr);
                        setErrorMsg(null);
                      }}
                      className={`min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap truncate ${
                        isSelected
                          ? 'bg-[#0D254C] dark:bg-[#2E7978] text-white border-[#0D254C] dark:border-[#2E7978]'
                          : 'bg-[#F8FAFC] dark:bg-[#0F1A2C] text-slate-700 dark:text-[#C5D2E3] border-slate-200/90 dark:border-[#293D5C] hover:border-[#0D254C]/45 dark:hover:border-[#9CC0F9]/55'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* LIVE PREVIEW READOUT */}
            {previewCountdown && (
              <div className="pt-4 border-t border-slate-200/80 dark:border-[#22324D] space-y-2.5 tabular-nums">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500 dark:text-[#9FB0C7]">
                    Countdown Preview
                  </span>
                  <span className="font-semibold text-[#143D3C] dark:text-[#68C7C5]">
                    {previewCountdown.formattedDate}
                  </span>
                </div>

                {previewCountdown.status === 'EXAM_DAY' ? (
                  <div className="py-2 text-sm font-semibold text-[#2E7978] dark:text-[#68C7C5]">
                    Exam Day is Today — Good luck, future RPm!
                  </div>
                ) : previewCountdown.status === 'PAST' ? (
                  <div className="py-2 text-xs text-[#8C4D11] dark:text-[#F2AE63]">
                    This date has already passed. You can still save it or pick an upcoming date.
                  </div>
                ) : (
                  <div className="grid grid-cols-4 divide-x divide-slate-200/80 dark:divide-[#22324D] py-1 text-center">
                    <div className="px-2">
                      <div className="font-mono text-xl sm:text-2xl font-bold text-[#0D254C] dark:text-[#F8FAFC]">
                        {String(previewCountdown.days).padStart(2, '0')}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-[#9FB0C7] mt-0.5">
                        Days
                      </div>
                    </div>
                    <div className="px-2">
                      <div className="font-mono text-xl sm:text-2xl font-bold text-[#0D254C] dark:text-[#F8FAFC]">
                        {String(previewCountdown.hours).padStart(2, '0')}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-[#9FB0C7] mt-0.5">
                        Hours
                      </div>
                    </div>
                    <div className="px-2">
                      <div className="font-mono text-xl sm:text-2xl font-bold text-[#2E7978] dark:text-[#68C7C5]">
                        {String(previewCountdown.minutes).padStart(2, '0')}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-[#9FB0C7] mt-0.5">
                        Minutes
                      </div>
                    </div>
                    <div className="px-2">
                      <div className="font-mono text-xl sm:text-2xl font-bold text-[#D9822B] dark:text-[#F2AE63]">
                        {String(previewCountdown.seconds).padStart(2, '0')}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-[#9FB0C7] mt-0.5">
                        Seconds
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="min-h-[44px] px-4 py-2.5 rounded-lg border border-slate-300 dark:border-[#293D5C] bg-white dark:bg-[#1A2942] hover:bg-slate-50 dark:hover:bg-[#243858] text-xs sm:text-sm font-semibold text-slate-700 dark:text-[#E6ECF5] transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0D254C] hover:bg-[#163567] dark:bg-[#2E7978] dark:hover:bg-[#378C8B] text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                <span>{onCancel ? 'Save Exam Date' : 'Continue to BLEPPIFY'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, Clock } from 'lucide-react';
import {
  DEFAULT_POMODORO_BREAK_MINUTES,
  DEFAULT_POMODORO_STUDY_MINUTES,
} from '../utils/bleppLogic';

type TimerPreset = 'classic' | 'blepp_deep' | 'custom';
type SessionPhase = 'study' | 'break';

interface PomodoroBarProps {
  completedToday: number;
  onIncrementCompleted: () => void;
}

function playWebAudioChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.14);
      osc.stop(ctx.currentTime + idx * 0.14 + 0.36);
    });
  } catch {
    // Ignore audio context restrictions if un-interacted
  }
}

export const PomodoroBar: React.FC<PomodoroBarProps> = ({
  completedToday,
  onIncrementCompleted,
}) => {
  const [preset, setPreset] = useState<TimerPreset>('classic');
  const [phase, setPhase] = useState<SessionPhase>('study');
  const [customStudyMins, setCustomStudyMins] = useState<number>(45);
  const [customBreakMins, setCustomBreakMins] = useState<number>(10);
  const [secondsLeft, setSecondsLeft] = useState<number>(
    DEFAULT_POMODORO_STUDY_MINUTES * 60
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onIncrementCompleted);
  callbackRef.current = onIncrementCompleted;

  const getTargetSeconds = (
    p: TimerPreset,
    ph: SessionPhase,
    cStudy: number,
    cBreak: number
  ) => {
    if (p === 'classic') {
      return (
        (ph === 'study'
          ? DEFAULT_POMODORO_STUDY_MINUTES
          : DEFAULT_POMODORO_BREAK_MINUTES) * 60
      );
    }
    if (p === 'blepp_deep') return (ph === 'study' ? 50 : 10) * 60;
    return Math.max(1, ph === 'study' ? cStudy : cBreak) * 60;
  };

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          playWebAudioChime();
          if (phase === 'study') {
            callbackRef.current();
            setPhase('break');
            return getTargetSeconds(preset, 'break', customStudyMins, customBreakMins);
          } else {
            setPhase('study');
            return getTargetSeconds(preset, 'study', customStudyMins, customBreakMins);
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning, phase, preset, customStudyMins, customBreakMins]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const handleSelectPreset = (newPreset: TimerPreset) => {
    setIsRunning(false);
    setPreset(newPreset);
    setPhase('study');
    setSecondsLeft(getTargetSeconds(newPreset, 'study', customStudyMins, customBreakMins));
  };

  const handleReset = () => {
    setIsRunning(false);
    setSecondsLeft(getTargetSeconds(preset, phase, customStudyMins, customBreakMins));
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-label="Open study timer settings"
        className={`inline-flex items-center gap-1.5 sm:gap-2 min-h-[40px] sm:min-h-0 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold tabular-nums transition-colors ${
          isRunning
            ? 'bg-[#FDF3E7] dark:bg-[#2C1D10] border-[#D9822B] dark:border-[#9A5B1E] text-[#3B2006] dark:text-[#F7DEC2]'
            : 'bg-[#EAF4F4] dark:bg-[#112A2D] hover:bg-[#D7ECEC] dark:hover:bg-[#17383C] border-[#2E7978]/40 dark:border-[#2E7978]/75 text-[#143D3C] dark:text-[#D5F2F1]'
        }`}
      >
        <Clock
          className={`w-3.5 h-3.5 ${
            isRunning
              ? 'text-[#8C4D11] dark:text-[#F2AE63]'
              : 'text-[#22605F] dark:text-[#68C7C5]'
          }`}
        />
        <span>{formattedTime}</span>
      </button>

      <button
        type="button"
        onClick={() => setIsRunning((r) => !r)}
        aria-label={isRunning ? 'Pause study timer' : 'Start study timer'}
        className={`inline-flex items-center justify-center min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 sm:p-1.5 rounded-lg transition-colors ${
          isRunning
            ? 'bg-[#D9822B] text-[#1C1208] hover:bg-[#C57320]'
            : 'bg-[#2E7978] text-white hover:bg-[#246160]'
        }`}
      >
        {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Pomodoro timer settings"
          className="fixed left-4 right-4 top-[60px] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 bg-white dark:bg-[#131F33] border border-slate-200 dark:border-[#22324D] rounded-xl shadow-lg p-4 z-50 space-y-3 text-xs"
        >
          <div className="flex items-center justify-between text-slate-600 dark:text-[#9FB0C7]">
            <span className="font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
              {phase === 'study' ? 'Focus Session' : 'Break'}
            </span>
            <span className="font-mono tabular-nums">Done today: {completedToday}</span>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 bg-[#ECEFF3] dark:bg-[#1A2942] rounded-lg">
            <button
              type="button"
              onClick={() => handleSelectPreset('classic')}
              className={`min-h-[36px] sm:min-h-0 py-1.5 sm:py-1 rounded font-medium transition-colors ${
                preset === 'classic'
                  ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] shadow-xs'
                  : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
              }`}
            >
              25 / 5
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('blepp_deep')}
              className={`min-h-[36px] sm:min-h-0 py-1.5 sm:py-1 rounded font-medium transition-colors ${
                preset === 'blepp_deep'
                  ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] shadow-xs'
                  : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
              }`}
            >
              50 / 10
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('custom')}
              className={`min-h-[36px] sm:min-h-0 py-1.5 sm:py-1 rounded font-medium transition-colors ${
                preset === 'custom'
                  ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] shadow-xs'
                  : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
              }`}
            >
              Custom
            </button>
          </div>

          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="space-y-1 text-slate-600 dark:text-[#9FB0C7]">
                <span>Focus (m)</span>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={customStudyMins}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value) || 25);
                    setCustomStudyMins(val);
                    if (phase === 'study' && !isRunning) setSecondsLeft(val * 60);
                  }}
                  className="w-full px-2.5 py-1.5 sm:py-1 text-base sm:text-xs bg-white dark:bg-[#1A2942] text-[#0F172A] dark:text-[#E6ECF5] border border-slate-300 dark:border-[#293D5C] rounded font-mono focus:outline-none focus:border-[#0D254C] dark:focus:border-[#9CC0F9]"
                />
              </label>
              <label className="space-y-1 text-slate-600 dark:text-[#9FB0C7]">
                <span>Break (m)</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={customBreakMins}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value) || 5);
                    setCustomBreakMins(val);
                    if (phase === 'break' && !isRunning) setSecondsLeft(val * 60);
                  }}
                  className="w-full px-2.5 py-1.5 sm:py-1 text-base sm:text-xs bg-white dark:bg-[#1A2942] text-[#0F172A] dark:text-[#E6ECF5] border border-slate-300 dark:border-[#293D5C] rounded font-mono focus:outline-none focus:border-[#0D254C] dark:focus:border-[#9CC0F9]"
                />
              </label>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#22324D]">
            <button
              type="button"
              onClick={handleReset}
              className="min-h-[36px] sm:min-h-0 inline-flex items-center gap-1 text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={playWebAudioChime}
              className="min-h-[36px] sm:min-h-0 inline-flex items-center gap-1 text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white font-medium"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Test Chime</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

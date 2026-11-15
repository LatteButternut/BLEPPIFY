import React, { useState } from 'react';
import { Printer, FileText, Grid, KeyRound, X } from 'lucide-react';
import { BoardQuestionItem } from '../data/tosData';
import { PrcAnswerSheet150 } from './PrcAnswerSheet150';
import { ShadedChoice } from '../utils/bleppLogic';

interface PrintPacketModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectTitle: string;
  weightPercent: number;
  scopeTitle: string;
  questions: BoardQuestionItem[];
  defaultItemCount?: number;
  shadedMap: Record<number, ShadedChoice>;
  initialTab?: 'questionnaire' | 'prc_sheet' | 'answer_key';
}

export const PrintPacketModal: React.FC<PrintPacketModalProps> = ({
  isOpen,
  onClose,
  subjectTitle,
  weightPercent,
  questions,
  defaultItemCount = 100,
  shadedMap,
  initialTab = 'prc_sheet',
}) => {
  const [activeDoc, setActiveDoc] = useState<'questionnaire' | 'prc_sheet' | 'answer_key'>(
    initialTab
  );

  if (!isOpen) return null;

  const effectiveItemCount = questions.length > 0 ? questions.length : defaultItemCount;

  const answerKeyMap: Record<number, 'A' | 'B' | 'C' | 'D' | 'E'> = {};
  questions.forEach((q, idx) => {
    answerKeyMap[idx + 1] = q.correctChoice;
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-packet-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white dark:bg-[#131F33] border border-slate-200 dark:border-[#22324D] rounded-xl max-w-[1320px] w-full max-h-[92dvh] flex flex-col shadow-xl overflow-hidden">
        {/* TOOLBAR (NO PRINT) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 bg-[#F8FAFC] dark:bg-[#1A2942] border-b border-slate-200 dark:border-[#22324D] no-print">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="print-packet-modal-title"
                className="text-base font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5]"
              >
                Printable BLEPP Exam Packet &amp; PRC Shading Sheet
              </h2>
              <p className="text-xs text-slate-600 dark:text-[#9FB0C7]">
                Select a document below and tap &quot;Print / Save as PDF&quot;.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Printable Exam Packet Modal"
              className="lg:hidden min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-slate-500 dark:text-[#9FB0C7] hover:text-[#0F172A] dark:hover:text-white rounded-lg shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 bg-[#ECEFF3] dark:bg-[#0B1320] rounded-lg">
              <button
                type="button"
                onClick={() => setActiveDoc('questionnaire')}
                className={`min-h-[38px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                  activeDoc === 'questionnaire'
                    ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] shadow-xs'
                    : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                <span className="sm:hidden">1. Questions</span>
                <span className="hidden sm:inline">1. Exam Questionnaire</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDoc('prc_sheet')}
                className={`min-h-[38px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                  activeDoc === 'prc_sheet'
                    ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] shadow-xs'
                    : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
                }`}
              >
                <Grid className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                <span className="sm:hidden">2. PRC Sheet</span>
                <span className="hidden sm:inline">2. 150-Item PRC Answer Sheet</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDoc('answer_key')}
                className={`min-h-[38px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                  activeDoc === 'answer_key'
                    ? 'bg-white dark:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] shadow-xs'
                    : 'text-slate-600 dark:text-[#9FB0C7] hover:text-[#0D254C] dark:hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                <span className="sm:hidden">3. Key</span>
                <span className="hidden sm:inline">3. Answer Key &amp; Rationales</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="w-full sm:w-auto min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save as PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Printable Exam Packet Modal"
              className="hidden lg:inline-flex p-2 text-slate-500 dark:text-[#9FB0C7] hover:text-[#0F172A] dark:hover:text-white rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINTABLE DOCUMENT STAGE */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-white dark:bg-[#0F1A2C] print:bg-white">
          {activeDoc === 'questionnaire' && (
            <div className="max-w-4xl mx-auto space-y-6 text-[#0F172A] dark:text-[#E6ECF5] print:text-slate-900">
              <div className="border-b-2 border-[#0D254C] dark:border-[#293D5C] print:border-slate-900 pb-4 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-[#9FB0C7] print:text-slate-900">
                  Republic of the Philippines · Professional Regulation Commission
                </div>
                <h1 className="text-xl font-display font-bold uppercase mt-1">
                  Psychometrician Licensure Examination (BLEPP) — {subjectTitle}
                </h1>
                <div className="text-xs text-slate-600 dark:text-[#9FB0C7] print:text-slate-600 mt-1 font-mono">
                  PRC Weight: {weightPercent}% · Time Allowance: 3 Hours (180 Minutes) · Total Items: {effectiveItemCount}
                </div>
              </div>

              <div className="space-y-5">
                {questions.map((q, idx) => (
                  <div key={q.id} className="text-sm leading-relaxed break-inside-avoid">
                    <div className="font-semibold text-[#0F172A] dark:text-[#E6ECF5] print:text-slate-900">
                      {idx + 1}. {q.stem}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2 pl-5 text-xs text-slate-800 dark:text-[#C5D2E3] print:text-slate-800">
                      <div>
                        <strong>A.</strong> {q.options.A}
                      </div>
                      <div>
                        <strong>B.</strong> {q.options.B}
                      </div>
                      <div>
                        <strong>C.</strong> {q.options.C}
                      </div>
                      <div>
                        <strong>D.</strong> {q.options.D}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeDoc === 'prc_sheet' && (
            <div>
              <PrcAnswerSheet150
                subjectTitle={subjectTitle}
                activeItemCount={effectiveItemCount}
                shadedMap={shadedMap}
                readOnly={true}
                forPrint={false}
              />
            </div>
          )}

          {activeDoc === 'answer_key' && (
            <div className="max-w-4xl mx-auto space-y-6 text-[#0F172A] dark:text-[#E6ECF5] print:text-slate-900">
              <div className="border-b-2 border-[#0D254C] dark:border-[#293D5C] print:border-slate-900 pb-4">
                <h1 className="text-lg font-display font-bold uppercase">
                  Official BLEPP Board Rationale & Answer Key — {subjectTitle}
                </h1>
                <p className="text-xs text-slate-600 dark:text-[#9FB0C7] print:text-slate-600 font-mono mt-0.5">
                  Aligned with PRC Annex B Table of Specifications (PQF Level 6)
                </p>
              </div>

              <div className="space-y-4">
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-4 border border-slate-200 dark:border-[#293D5C] print:border-slate-200 rounded-lg break-inside-avoid space-y-1.5 bg-white dark:bg-[#131F33] print:bg-white"
                  >
                    <div className="flex items-center justify-between text-xs font-mono text-slate-600 dark:text-[#9FB0C7] print:text-slate-600">
                      <span>
                        Item #{idx + 1} · Correct Answer:{' '}
                        <strong className="text-[#22605F] dark:text-[#68C7C5] print:text-emerald-700 text-sm">[{q.correctChoice}]</strong>
                      </span>
                      <span>{q.bloomsLevel}</span>
                    </div>
                    <div className="text-xs font-semibold text-[#0F172A] dark:text-[#E6ECF5] print:text-slate-900">{q.stem}</div>
                    <div className="text-xs text-slate-700 dark:text-[#C5D2E3] print:text-slate-700 pt-1 border-t border-slate-100 dark:border-[#22324D] print:border-slate-100">
                      <strong>Board Rationale:</strong> {q.rationale}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4">
                <h3 className="text-xs font-bold uppercase text-slate-700 dark:text-[#9FB0C7] print:text-slate-700 mb-2">
                  Shaded Key Overlay on 150-Item PRC Form:
                </h3>
                <PrcAnswerSheet150
                  subjectTitle={`${subjectTitle} (ANSWER KEY)`}
                  activeItemCount={effectiveItemCount}
                  shadedMap={answerKeyMap}
                  readOnly={true}
                  forPrint={false}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { buildPrc150SheetColumns, ShadedChoice } from '../utils/bleppLogic';

interface PrcAnswerSheet150Props {
  subjectTitle: string;
  examineeName?: string;
  onExamineeNameChange?: (name: string) => void;
  questionSet?: 'A' | 'B';
  onQuestionSetChange?: (set: 'A' | 'B') => void;
  activeItemCount: number; // e.g. 130 for Psychological Assessment, 100 for Dev/Abnormal/IO, or N for section drill
  shadedMap: Record<number, ShadedChoice>;
  onToggleChoice?: (itemNumber: number, letter: 'A' | 'B' | 'C' | 'D' | 'E') => void;
  readOnly?: boolean;
  showAnswerKeyOverlay?: boolean;
  answerKeyMap?: Record<number, 'A' | 'B' | 'C' | 'D' | 'E'>;
  forPrint?: boolean;
}

const COLUMNS_150 = buildPrc150SheetColumns();
const CHOICES: Array<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E'];

export const PrcAnswerSheet150: React.FC<PrcAnswerSheet150Props> = ({
  subjectTitle,
  examineeName = '',
  onExamineeNameChange,
  questionSet = 'A',
  onQuestionSetChange,
  activeItemCount,
  shadedMap,
  onToggleChoice,
  readOnly = false,
  showAnswerKeyOverlay = false,
  answerKeyMap = {},
  forPrint = false,
}) => {
  const [idDigits, setIdDigits] = useState<Array<number | null>>([
    null,
    null,
    null,
    null,
    null,
    null,
  ]);

  const [mobileColIdx, setMobileColIdx] = useState<number>(1);

  const handleDigitSelect = (colIdx: number, digit: number) => {
    if (readOnly) return;
    setIdDigits((prev) => {
      const copy = [...prev];
      copy[colIdx] = copy[colIdx] === digit ? null : digit;
      return copy;
    });
  };

  const d = (classes: string) => (forPrint ? '' : classes);
  const activeMobileCol =
    COLUMNS_150.find((c) => c.columnIndex === mobileColIdx) || COLUMNS_150[0];

  return (
    <div
      data-testid="prc-150-answer-sheet"
      className={`bg-white border-2 border-[#0D254C] text-[#0D254C] rounded-xl lg:rounded-sm shadow-xs overflow-hidden lg:overflow-x-auto select-none ${d(
        'dark:bg-[#0F1A2C] dark:border-[#9CC0F9]/55 dark:text-[#E6ECF5]'
      )}`}
    >
      {/* MOBILE TOUCH-PROPORTIONED PRC ANSWER SHEET (HIDDEN ON DESKTOP & PRINT) */}
      {!forPrint && (
        <div className="lg:hidden print:hidden p-3.5 sm:p-4 space-y-3.5">
          {/* COMPACT MOBILE PRC HEADER */}
          <div className="border border-[#0D254C] dark:border-[#293D5C] rounded-lg p-3 bg-[#F8FAFC] dark:bg-[#131F33] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wide text-[#0D254C] dark:text-[#9CC0F9]">
                PRC 150-Item Answer Sheet
              </span>
              <span className="text-[11px] font-mono font-semibold text-slate-600 dark:text-[#9FB0C7]">
                Active: 1–{activeItemCount}
              </span>
            </div>

            <div className="text-xs font-bold uppercase text-[#0F172A] dark:text-[#E6ECF5] truncate">
              {subjectTitle}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
              <div className="sm:col-span-8">
                <label className="block text-[10px] font-bold uppercase text-[#0D254C] dark:text-[#9CC0F9] mb-1">
                  Examinee Name (Surname, First, M.I.)
                </label>
                {readOnly ? (
                  <div className="font-mono text-xs font-bold uppercase text-[#0F172A] dark:text-[#E6ECF5] border border-slate-300 dark:border-[#293D5C] rounded-md px-2.5 py-2 min-h-[38px] bg-white dark:bg-[#0F1A2C]">
                    {examineeName || '—'}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="SURNAME, FIRST NAME, M.I."
                    aria-label="Mobile Examinee Full Name"
                    value={examineeName}
                    onChange={(e) => onExamineeNameChange?.(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 text-base font-mono font-semibold uppercase text-[#0F172A] dark:text-[#E6ECF5] placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-[#0F1A2C] border border-slate-300 dark:border-[#293D5C] rounded-lg focus:outline-none focus:border-[#0D254C] dark:focus:border-[#9CC0F9]"
                  />
                )}
              </div>

              <div className="sm:col-span-4">
                <span className="block text-[10px] font-bold uppercase text-[#0D254C] dark:text-[#9CC0F9] mb-1">
                  Question Set
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['A', 'B'] as const).map((setChar) => {
                    const isSelected = questionSet === setChar;
                    return (
                      <button
                        key={`mob_set_${setChar}`}
                        type="button"
                        disabled={readOnly}
                        onClick={() => onQuestionSetChange?.(setChar)}
                        className={`min-h-[40px] rounded-lg border font-mono text-xs font-bold transition-colors ${
                          isSelected
                            ? 'bg-[#0D254C] dark:bg-[#9CC0F9] text-white dark:text-[#0B1320] border-[#0D254C] dark:border-[#9CC0F9]'
                            : 'bg-white dark:bg-[#0F1A2C] text-[#0D254C] dark:text-[#9CC0F9] border-slate-300 dark:border-[#293D5C]'
                        }`}
                      >
                        Set {setChar} {isSelected ? '█' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <details className="text-[11px] text-slate-600 dark:text-[#9FB0C7] pt-1 border-t border-slate-200/80 dark:border-[#22324D]">
              <summary className="cursor-pointer font-medium text-[#0D254C] dark:text-[#9CC0F9]">
                PRC Shading Rules
              </summary>
              <p className="mt-1.5 leading-relaxed">
                Shade only one choice [A]–[E] per item. Multiple marks or erasures cancel the item. Only items 1–{activeItemCount} are scored for this subject.
              </p>
            </details>
          </div>

          {/* 6-COLUMN BLOCK SELECTOR (25 ITEMS PER BLOCK) */}
          <div
            role="tablist"
            aria-label="Select 25-item column range"
            className="grid grid-cols-3 sm:grid-cols-6 gap-1.5"
          >
            {COLUMNS_150.map((col) => {
              const isSelected = col.columnIndex === activeMobileCol.columnIndex;
              const isUnusedBlock = col.startItem > activeItemCount;
              const shadedInCol = col.items.filter((num) => {
                const v = shadedMap[num];
                return v && v !== 'BLANK';
              }).length;

              return (
                <button
                  key={`mob_col_${col.columnIndex}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setMobileColIdx(col.columnIndex)}
                  className={`min-h-[40px] px-2 py-1.5 rounded-lg border text-xs font-mono transition-colors flex flex-col items-center justify-center leading-tight ${
                    isSelected
                      ? 'bg-[#0D254C] dark:bg-[#234B82] text-white border-[#0D254C] dark:border-[#9CC0F9]/60 font-bold'
                      : isUnusedBlock
                      ? 'bg-slate-50 dark:bg-[#0B1320]/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-[#22324D]'
                      : 'bg-white dark:bg-[#131F33] text-[#0D254C] dark:text-[#E6ECF5] border-slate-200 dark:border-[#293D5C]'
                  }`}
                >
                  <span>
                    {col.startItem}–{col.endItem}
                  </span>
                  <span
                    className={`text-[10px] ${
                      isSelected
                        ? 'text-[#DCE6F5]'
                        : 'text-slate-500 dark:text-[#9FB0C7]'
                    }`}
                  >
                    {shadedInCol}/25
                  </span>
                </button>
              );
            })}
          </div>

          {/* TOUCH-SIZED BUBBLE LIST FOR SELECTED 25-ITEM COLUMN */}
          <div className="border border-[#0D254C]/40 dark:border-[#293D5C] rounded-lg overflow-hidden bg-white dark:bg-[#131F33]">
            <div className="bg-[#0D254C] dark:bg-[#1A2D4A] text-white px-3 py-2 text-xs font-mono font-bold flex items-center justify-between">
              <span>
                ITEMS {activeMobileCol.startItem}–{activeMobileCol.endItem}
              </span>
              {activeMobileCol.startItem > activeItemCount && (
                <span className="text-[10px] font-normal text-[#F2AE63]">
                  Unused Rows ({activeItemCount + 1}–150)
                </span>
              )}
            </div>

            <div className="divide-y divide-slate-100 dark:divide-[#22324D]">
              {activeMobileCol.items.map((itemNum) => {
                const isWithinActiveExam = itemNum <= activeItemCount;
                const userChoice = shadedMap[itemNum] || 'BLANK';
                const keyChoice = answerKeyMap[itemNum];
                const isMultipleOrInvalid =
                  userChoice === 'MULTIPLE_SHADED' ||
                  userChoice === 'ERASURE_OR_INVALID_MARK';

                return (
                  <div
                    key={`mob_item_${itemNum}`}
                    className={`min-h-[44px] px-2.5 py-1.5 flex items-center justify-between gap-2 ${
                      !isWithinActiveExam
                        ? 'opacity-50 bg-slate-100/80 dark:bg-[#0B1320]/80'
                        : itemNum % 5 === 0
                        ? 'bg-[#EDF2FA]/50 dark:bg-[#1A2942]/55'
                        : 'bg-white dark:bg-[#131F33]'
                    }`}
                  >
                    <span className="font-mono font-bold text-xs w-8 text-right pr-1 text-[#0D254C] dark:text-[#C5D2E3] tabular-nums shrink-0">
                      {itemNum}.
                    </span>

                    <div className="flex items-center justify-end gap-1.5 flex-1">
                      {CHOICES.map((letter) => {
                        const isShaded = userChoice === letter;
                        const isCorrectAnswerInKey =
                          showAnswerKeyOverlay &&
                          isWithinActiveExam &&
                          keyChoice === letter;

                        let boxClasses =
                          'bg-white dark:bg-[#0B1320] text-[#0D254C] dark:text-[#9CC0F9] border-[#0D254C]/70 dark:border-[#293D5C]';
                        if (isShaded) {
                          if (showAnswerKeyOverlay && isWithinActiveExam && keyChoice) {
                            boxClasses =
                              keyChoice === letter
                                ? 'bg-[#2E7978] dark:bg-[#68C7C5] text-white dark:text-[#0B1320] border-[#246160] dark:border-[#68C7C5] font-bold'
                                : 'bg-rose-700 dark:bg-rose-500 text-white border-rose-800 dark:border-rose-400 font-bold';
                          } else {
                            boxClasses =
                              'bg-[#0D254C] dark:bg-[#9CC0F9] text-white dark:text-[#0B1320] border-[#0D254C] dark:border-[#9CC0F9] font-bold';
                          }
                        } else if (isCorrectAnswerInKey) {
                          boxClasses =
                            'bg-[#EAF4F4] dark:bg-[#112A2D] text-[#143D3C] dark:text-[#68C7C5] border-[#2E7978] font-bold ring-1 ring-[#2E7978]';
                        } else if (isMultipleOrInvalid) {
                          boxClasses =
                            'bg-[#FDF3E7] dark:bg-[#2C1D10] text-[#3B2006] dark:text-[#F2AE63] border-[#D9822B] dark:border-[#9A5B1E]';
                        }

                        return (
                          <button
                            key={`mob_${itemNum}_${letter}`}
                            type="button"
                            disabled={readOnly}
                            onClick={() => onToggleChoice?.(itemNum, letter)}
                            aria-label={`Mobile Item ${itemNum} choice ${letter}`}
                            className={`flex-1 max-w-[52px] min-h-[36px] border text-xs font-mono leading-none flex items-center justify-center rounded transition-colors active:scale-[0.97] ${boxClasses}`}
                          >
                            {isShaded ? '█' : letter}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PREV / NEXT 25-ITEM COLUMN BLOCK NAVIGATION */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={activeMobileCol.columnIndex <= 1}
              onClick={() => setMobileColIdx((c) => Math.max(1, c - 1))}
              className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-[#293D5C] bg-[#F8FAFC] dark:bg-[#131F33] text-xs font-semibold text-[#0D254C] dark:text-[#E6ECF5] disabled:opacity-40"
            >
              ← Prev 25 Items
            </button>
            <button
              type="button"
              disabled={activeMobileCol.columnIndex >= 6}
              onClick={() => setMobileColIdx((c) => Math.min(6, c + 1))}
              className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-[#293D5C] bg-[#F8FAFC] dark:bg-[#131F33] text-xs font-semibold text-[#0D254C] dark:text-[#E6ECF5] disabled:opacity-40"
            >
              Next 25 Items →
            </button>
          </div>
        </div>
      )}

      {/* DESKTOP & PRINT 6×25 OFFICIAL LANDSCAPE PRC SHEET */}
      <div
        className={`${
          forPrint ? 'block' : 'hidden lg:block print:block'
        } min-w-[1140px] p-3 flex flex-col gap-2`}
      >
        {/* TOP HEADER SECTION */}
        <div
          className={`grid grid-cols-12 gap-2 border-b-2 border-[#0D254C] pb-2 ${d(
            'dark:border-[#293D5C]'
          )}`}
        >
          {/* LEFT BOX: PRC BANNER, NAME, AND SUBJECT */}
          <div
            className={`col-span-5 flex flex-col justify-between border border-[#0D254C] p-2 ${d(
              'dark:border-[#293D5C] dark:bg-[#131F33]'
            )}`}
          >
            <div
              className={`flex items-center justify-between gap-2 pb-1.5 border-b border-[#0D254C] ${d(
                'dark:border-[#293D5C]'
              )}`}
            >
              <div>
                <div
                  className={`text-[10px] font-bold tracking-wider uppercase text-[#0D254C] ${d(
                    'dark:text-[#9CC0F9]'
                  )}`}
                >
                  Republic of the Philippines · Professional Regulation Commission
                </div>
                <div
                  className={`text-xs font-bold text-[#0F172A] ${d('dark:text-[#E6ECF5]')}`}
                >
                  BOARD OF PSYCHOLOGY · BLEPP PSYCHOMETRICIAN (PQF LEVEL 6)
                </div>
              </div>
              <div
                className={`px-2 py-0.5 border border-rose-600 text-rose-700 font-mono text-[10px] font-bold uppercase ${d(
                  'dark:border-rose-400/70 dark:text-rose-300'
                )}`}
              >
                150-ITEM OMR FORM
              </div>
            </div>

            <div
              className={`bg-[#0D254C] text-white text-center font-label font-bold tracking-widest text-sm py-1 my-1.5 uppercase ${d(
                'dark:bg-[#1A2D4A] dark:text-[#E6ECF5]'
              )}`}
            >
              EXAMINATION ANSWER SHEET
            </div>

            {/* NAME FIELD */}
            <div
              className={`border border-[#0D254C] p-1.5 mb-1.5 bg-slate-50/50 ${d(
                'dark:border-[#293D5C] dark:bg-[#1A2942]/70'
              )}`}
            >
              <div
                className={`flex items-center justify-between text-[10px] font-bold text-[#0D254C] mb-0.5 ${d(
                  'dark:text-[#9CC0F9]'
                )}`}
              >
                <span>NAME : (USE BLACK BALLPEN)</span>
                <span>SURNAME / FIRST NAME / MIDDLE INITIAL</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[#0D254C] font-bold text-sm ${d('dark:text-[#9CC0F9]')}`}
                  aria-hidden="true"
                >
                  ▶
                </span>
                {readOnly || forPrint ? (
                  <div
                    className={`font-mono text-xs font-bold uppercase text-[#0F172A] tracking-wider border-b border-slate-400 w-full py-0.5 min-h-[20px] ${d(
                      'dark:text-[#E6ECF5] dark:border-[#293D5C]'
                    )}`}
                  >
                    {examineeName}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="ENTER SURNAME, FIRST NAME, M.I."
                    aria-label="Examinee Full Name"
                    value={examineeName}
                    onChange={(e) => onExamineeNameChange?.(e.target.value)}
                    className="font-mono text-xs font-bold uppercase text-[#0F172A] dark:text-[#E6ECF5] placeholder:text-slate-400 dark:placeholder:text-slate-500 tracking-wider border-b border-[#0D254C] dark:border-[#293D5C] w-full py-0.5 bg-transparent focus:outline-none"
                  />
                )}
              </div>
            </div>

            {/* SUBJECT FIELD */}
            <div
              className={`border border-[#0D254C] p-1.5 bg-white ${d(
                'dark:border-[#293D5C] dark:bg-[#0F1A2C]'
              )}`}
            >
              <div
                className={`flex items-center justify-between text-[10px] font-bold text-[#0D254C] ${d(
                  'dark:text-[#9CC0F9]'
                )}`}
              >
                <span>SUBJECT : (WRITE ONLY THE SUBJECT TITLE)</span>
                <span className="font-mono">
                  ACTIVE ITEMS: 1–{activeItemCount} OF 150
                </span>
              </div>
              <div
                className={`font-mono text-xs font-bold uppercase text-[#0F172A] tracking-wide mt-0.5 border-b border-slate-400 pb-0.5 ${d(
                  'dark:text-[#E6ECF5] dark:border-[#293D5C]'
                )}`}
              >
                {subjectTitle.toUpperCase()}
              </div>
            </div>
          </div>

          {/* RIGHT BOX: INSTRUCTIONS TO EXAMINEE A & B */}
          <div
            className={`col-span-7 border border-[#0D254C] flex flex-col ${d(
              'dark:border-[#293D5C] dark:bg-[#131F33]'
            )}`}
          >
            <div
              className={`bg-[#0D254C] text-white font-label font-bold text-xs px-2.5 py-1 tracking-wider uppercase ${d(
                'dark:bg-[#1A2D4A] dark:text-[#E6ECF5]'
              )}`}
            >
              INSTRUCTIONS TO EXAMINEE:
            </div>
            <div
              className={`grid grid-cols-2 gap-3 p-2 text-[10px] leading-snug text-[#0D254C] ${d(
                'dark:text-[#C5D2E3]'
              )}`}
            >
              <div
                className={`border-r border-[#0D254C]/35 pr-2 ${d('dark:border-[#293D5C]')}`}
              >
                <div className={`font-bold underline mb-1 ${d('dark:text-[#E6ECF5]')}`}>
                  A. SUBJECT BOX
                </div>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>
                    Detach one (1) answer sheet and write the subject title on the{' '}
                    <strong>SUBJECT BOX</strong> (upper-left side).
                  </li>
                  <li>
                    <strong>DO NOT WRITE YOUR NAME</strong>, seat number, or unnecessary marks inside the Subject Box.
                  </li>
                  <li>
                    Putting an <strong>&quot;X&quot;</strong> over a wrong subject title will{' '}
                    <strong>invalidate</strong> this answer sheet. Put a{' '}
                    <strong>horizontal line (—)</strong> on the wrong subject title and write the correct title beside or above it.
                  </li>
                  <li>
                    <strong>DO NOT USE</strong> correction fluid/ribbon or eraser on the Subject Box.
                  </li>
                </ol>
              </div>
              <div>
                <div className={`font-bold underline mb-1 ${d('dark:text-[#E6ECF5]')}`}>
                  B. LETTER CHOICES BOX
                </div>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>
                    Use <strong>No. 2 pencil only</strong>. Follow the instruction on the lower left portion (`MARK LIKE THIS: █`).
                  </li>
                  <li>
                    Shade box <strong>A or B</strong> for your Test Question Set. Failing to do so invalidates this sheet.
                  </li>
                  <li>
                    Shade <strong>ONLY ONE (1)</strong> vertical bracket box `[A] [B] [C] [D] [E]` for each item. Two or more boxes shaded cancels the item.
                  </li>
                  <li>
                    <strong>AVOID ERASURES.</strong> If NOT sure of your answer, leave it blank first and return later.
                  </li>
                  <li>
                    Do not fold, crumple, or mutilate this 150-item form.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* LOWER MAIN BODY: LEFT CONTROL COLUMN + 6 COLUMNS x 25 ITEMS (1 TO 150) */}
        <div className="grid grid-cols-12 gap-2 items-stretch">
          {/* LEFT CONTROL PANEL (2 COLUMNS WIDE) */}
          <div
            className={`col-span-2 flex flex-col justify-between gap-2 border border-[#0D254C] p-2 bg-[#F8FAFC] ${d(
              'dark:border-[#293D5C] dark:bg-[#131F33]'
            )}`}
          >
            {/* TEST QUESTION SET BOX */}
            <div
              className={`border border-[#0D254C] bg-white p-1.5 ${d(
                'dark:border-[#293D5C] dark:bg-[#0F1A2C]'
              )}`}
            >
              <div
                className={`bg-[#0D254C] text-white text-[9px] font-bold text-center py-0.5 uppercase tracking-wider ${d(
                  'dark:bg-[#1A2D4A] dark:text-[#E6ECF5]'
                )}`}
              >
                TEST QUESTION SET BOX
              </div>
              <div className="flex items-center justify-around py-2">
                <span className={`text-[10px] font-bold ${d('dark:text-[#E6ECF5]')}`}>
                  SET &gt;
                </span>
                {(['A', 'B'] as const).map((setChar) => {
                  const isSelected = questionSet === setChar;
                  return (
                    <button
                      key={setChar}
                      type="button"
                      disabled={readOnly}
                      onClick={() => onQuestionSetChange?.(setChar)}
                      aria-label={`Select Test Question Set ${setChar}`}
                      className="flex flex-col items-center gap-0.5 group"
                    >
                      <span
                        className={`text-[9px] font-bold text-[#0D254C] ${d(
                          'dark:text-[#9CC0F9]'
                        )}`}
                      >
                        {setChar}
                      </span>
                      <span
                        className={`w-3.5 h-5 border border-[#0D254C] flex items-center justify-center font-mono text-[9px] transition-colors ${
                          isSelected
                            ? `bg-[#0D254C] text-white font-bold ${d(
                                'dark:bg-[#9CC0F9] dark:text-[#0B1320] dark:border-[#9CC0F9]'
                              )}`
                            : `bg-white text-[#0D254C] group-hover:bg-[#EDF2FA] ${d(
                                'dark:bg-[#0B1320] dark:text-[#9CC0F9] dark:border-[#293D5C] dark:group-hover:bg-[#1A2942]'
                              )}`
                        }`}
                      >
                        {isSelected ? '█' : setChar}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* EXAMINEE ID NUMBER 6-COLUMN VERTICAL GRID */}
            <div
              className={`border border-[#0D254C] bg-white p-1.5 ${d(
                'dark:border-[#293D5C] dark:bg-[#0F1A2C]'
              )}`}
            >
              <div
                className={`bg-[#0D254C] text-white text-[9px] font-bold text-center py-0.5 uppercase tracking-wider mb-1 ${d(
                  'dark:bg-[#1A2D4A] dark:text-[#E6ECF5]'
                )}`}
              >
                Examinee ID Number
              </div>
              <div className="grid grid-cols-6 gap-0.5 text-center mb-1">
                {idDigits.map((digit, colIdx) => (
                  <div
                    key={colIdx}
                    className={`border border-[#0D254C] font-mono text-[10px] font-bold text-[#0F172A] bg-slate-50 py-0.5 h-5 flex items-center justify-center ${d(
                      'dark:border-[#293D5C] dark:text-[#E6ECF5] dark:bg-[#1A2942]'
                    )}`}
                  >
                    {digit !== null ? digit : ''}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-6 gap-0.5">
                {idDigits.map((selectedDigit, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-0.5 items-center">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
                      const isShaded = selectedDigit === num;
                      return (
                        <button
                          key={num}
                          type="button"
                          disabled={readOnly}
                          onClick={() => handleDigitSelect(colIdx, num)}
                          aria-label={`Examinee ID column ${colIdx + 1} digit ${num}`}
                          className={`w-3.5 h-3.5 border border-[#0D254C]/70 font-mono text-[8px] leading-none flex items-center justify-center ${
                            isShaded
                              ? `bg-[#0D254C] text-white font-bold ${d(
                                  'dark:bg-[#9CC0F9] dark:text-[#0B1320] dark:border-[#9CC0F9]'
                                )}`
                              : `bg-white text-[#0D254C] ${d(
                                  'dark:bg-[#0B1320] dark:text-[#9CC0F9] dark:border-[#293D5C]'
                                )}`
                          }`}
                        >
                          {isShaded ? '█' : num}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* IMPORTANT MARKING GUIDE BOX */}
            <div
              className={`border border-[#0D254C] bg-white p-1.5 text-[9px] leading-tight ${d(
                'dark:border-[#293D5C] dark:bg-[#0F1A2C] dark:text-[#C5D2E3]'
              )}`}
            >
              <div
                className={`bg-[#0D254C] text-white font-bold text-center py-0.5 uppercase mb-1 ${d(
                  'dark:bg-[#1A2D4A] dark:text-[#E6ECF5]'
                )}`}
              >
                IMPORTANT
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[8.5px] mb-1.5">
                <li>DO NOT USE TOO MUCH PRESSURE</li>
                <li>USE STANDARD NO. 2 PENCIL ONLY</li>
                <li>MAKE THE MARK DARK AND STRAIGHT</li>
              </ul>
              <div
                className={`border-t border-[#0D254C]/35 pt-1 flex flex-col gap-1 font-mono ${d(
                  'dark:border-[#293D5C]'
                )}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">MARK LIKE THIS:</span>
                  <span
                    className={`inline-block w-3 h-4 bg-[#0D254C] border border-[#0D254C] ${d(
                      'dark:bg-[#9CC0F9] dark:border-[#9CC0F9]'
                    )}`}
                  />
                </div>
                <div
                  className={`flex items-center justify-between text-rose-700 ${d(
                    'dark:text-rose-400'
                  )}`}
                >
                  <span className="font-bold">NOT LIKE THIS:</span>
                  <span className="font-bold tracking-widest">✗ - /</span>
                </div>
              </div>
            </div>
          </div>

          {/* 6 CONTINUOUS VERTICAL COLUMNS OF 25 ITEMS EACH (ITEMS 1 TO 150) */}
          <div className="col-span-10 grid grid-cols-6 gap-1.5">
            {COLUMNS_150.map((col) => (
              <div
                key={col.columnIndex}
                data-testid={`prc-sheet-column-${col.columnIndex}`}
                className={`border border-[#0D254C] bg-white flex flex-col justify-between ${d(
                  'dark:border-[#293D5C] dark:bg-[#131F33]'
                )}`}
              >
                <div
                  className={`bg-[#0D254C] text-white text-[10px] font-mono font-bold text-center py-0.5 tracking-wider ${d(
                    'dark:bg-[#1A2D4A] dark:text-[#E6ECF5]'
                  )}`}
                >
                  ITEMS {col.startItem}–{col.endItem}
                </div>

                <div
                  className={`divide-y divide-[#0D254C]/20 ${d('dark:divide-[#22324D]')}`}
                >
                  {col.items.map((itemNum) => {
                    const isWithinActiveExam = itemNum <= activeItemCount;
                    const userChoice = shadedMap[itemNum] || 'BLANK';
                    const keyChoice = answerKeyMap[itemNum];
                    const isMultipleOrInvalid =
                      userChoice === 'MULTIPLE_SHADED' || userChoice === 'ERASURE_OR_INVALID_MARK';

                    return (
                      <div
                        key={itemNum}
                        className={`flex items-center justify-between px-1.5 py-[2.5px] text-[10px] transition-colors ${
                          !isWithinActiveExam && !forPrint
                            ? 'opacity-45 bg-slate-100/80 dark:bg-[#0B1320]/80'
                            : itemNum % 5 === 0
                            ? `bg-[#EDF2FA]/55 ${d('dark:bg-[#1A2942]/65')}`
                            : `bg-white ${d('dark:bg-[#131F33]')}`
                        }`}
                      >
                        <span
                          className={`font-mono font-bold text-[10px] w-6 text-right pr-1.5 text-[#0D254C] tabular-nums ${d(
                            'dark:text-[#C5D2E3]'
                          )}`}
                        >
                          {itemNum}
                        </span>

                        <div className="flex items-center gap-1">
                          {CHOICES.map((letter) => {
                            const isShaded = userChoice === letter;
                            const isCorrectAnswerInKey =
                              showAnswerKeyOverlay && isWithinActiveExam && keyChoice === letter;

                            let boxClasses = `bg-white text-[#0D254C] border-[#0D254C]/80 hover:bg-[#EDF2FA] ${d(
                              'dark:bg-[#0B1320] dark:text-[#9CC0F9] dark:border-[#293D5C] dark:hover:bg-[#1A2942]'
                            )}`;
                            if (isShaded) {
                              if (showAnswerKeyOverlay && isWithinActiveExam && keyChoice) {
                                boxClasses =
                                  keyChoice === letter
                                    ? `bg-[#2E7978] text-white border-[#246160] font-bold ${d(
                                        'dark:bg-[#68C7C5] dark:text-[#0B1320] dark:border-[#68C7C5]'
                                      )}`
                                    : `bg-rose-700 text-white border-rose-800 font-bold ${d(
                                        'dark:bg-rose-500 dark:text-white dark:border-rose-400'
                                      )}`;
                              } else {
                                boxClasses = `bg-[#0D254C] text-white border-[#0D254C] font-bold ${d(
                                  'dark:bg-[#9CC0F9] dark:text-[#0B1320] dark:border-[#9CC0F9]'
                                )}`;
                              }
                            } else if (isCorrectAnswerInKey) {
                              boxClasses = `bg-[#EAF4F4] text-[#143D3C] border-[#2E7978] font-bold ring-1 ring-[#2E7978] ${d(
                                'dark:bg-[#112A2D] dark:text-[#68C7C5] dark:border-[#2E7978]'
                              )}`;
                            } else if (isMultipleOrInvalid) {
                              boxClasses = `bg-[#FDF3E7] text-[#3B2006] border-[#D9822B] ${d(
                                'dark:bg-[#2C1D10] dark:text-[#F2AE63] dark:border-[#9A5B1E]'
                              )}`;
                            }

                            return (
                              <button
                                key={letter}
                                type="button"
                                disabled={readOnly}
                                onClick={() => onToggleChoice?.(itemNum, letter)}
                                aria-label={`Item ${itemNum} choice ${letter}`}
                                className={`w-[18px] h-[16px] border text-[9px] font-mono leading-none flex items-center justify-center rounded-[1px] transition-colors ${boxClasses}`}
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
            ))}
          </div>
        </div>

        {/* FOOTER LEGEND (HIDDEN ON PRINT) */}
        {!forPrint && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-600 dark:text-[#9FB0C7] border-t border-slate-200 dark:border-[#22324D] no-print">
            <div className="flex items-center gap-4">
              <span>
                <strong className="text-[#0F172A] dark:text-[#E6ECF5]">Active Exam Scope:</strong>{' '}
                Items 1 to {activeItemCount}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong className="text-[#0F172A] dark:text-[#E6ECF5]">Unused Rows:</strong>{' '}
                {activeItemCount < 150
                  ? `Items ${activeItemCount + 1} to 150 (Ignored in scoring unless accidentally shaded)`
                  : 'All 150 items active'}
              </span>
            </div>
            <div className="font-mono text-[11px] text-[#0D254C] dark:text-[#9CC0F9]">
              Click any vertical bracket [A] [B] [C] [D] [E] to shade or clear your answer
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

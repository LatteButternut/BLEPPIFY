export type SubjectId = 'dev_psych' | 'psych_assessment' | 'abnormal_psych' | 'io_psych';

export type BloomsLevel =
  | 'Remembering'
  | 'Understanding'
  | 'Applying'
  | 'Analyzing'
  | 'Evaluating'
  | 'Creating';

export type DifficultyTier = 'Easy' | 'Moderate' | 'Difficult';

export type ShadedChoice = 'A' | 'B' | 'C' | 'D' | 'E' | 'BLANK' | 'MULTIPLE_SHADED' | 'ERASURE_OR_INVALID_MARK';

export interface SubjectGrades {
  dev_psych: number;
  psych_assessment: number;
  abnormal_psych: number;
  io_psych: number;
}

export interface GwaCalculationResult {
  gwa: number;
  passedOverall: boolean;
  hasDisqualifyingSubject: boolean;
  disqualifiedSubjects: SubjectId[];
  finalVerdict: 'PASSED' | 'CONDITIONAL / FAILED (SUB-50 CUTOFF)' | 'FAILED';
  weightedContributions: {
    dev_psych: number;
    psych_assessment: number;
    abnormal_psych: number;
    io_psych: number;
  };
}

export const SUBJECT_WEIGHTS: Record<SubjectId, number> = {
  dev_psych: 0.2,
  psych_assessment: 0.4,
  abnormal_psych: 0.2,
  io_psych: 0.2,
};

export const STANDARD_PASSING_TARGET_PERCENT = 75;
export const DEFAULT_TOPNOTCHER_TARGET_PERCENT = 90;
export const TOPNOTCHER_TARGET_PERCENT = DEFAULT_TOPNOTCHER_TARGET_PERCENT;
export const MIN_TOPNOTCHER_TARGET_PERCENT = 76;
export const MAX_TOPNOTCHER_TARGET_PERCENT = 99;
export const TOPNOTCHER_THRESHOLD_PRESETS = [85, 88, 90, 92] as const;
export const SUBJECT_CUTOFF_PERCENT = 50;

export function normalizeTopnotcherThreshold(
  raw: unknown,
  fallback: number = DEFAULT_TOPNOTCHER_TARGET_PERCENT
): number {
  const safeFallback = Math.min(
    MAX_TOPNOTCHER_TARGET_PERCENT,
    Math.max(
      MIN_TOPNOTCHER_TARGET_PERCENT,
      Number.isFinite(fallback) ? fallback : DEFAULT_TOPNOTCHER_TARGET_PERCENT
    )
  );
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) {
    return Number(safeFallback.toFixed(1));
  }
  const clamped = Math.min(
    MAX_TOPNOTCHER_TARGET_PERCENT,
    Math.max(MIN_TOPNOTCHER_TARGET_PERCENT, parsed)
  );
  return Number(clamped.toFixed(1));
}

export function formatThresholdPercent(pct: number): string {
  const rounded = Number(pct.toFixed(1));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export const ZERO_SUBJECT_GRADES: SubjectGrades = {
  dev_psych: 0,
  psych_assessment: 0,
  abnormal_psych: 0,
  io_psych: 0,
};

/**
 * Calculates the official PRC BLEPP General Weighted Average (GWA)
 * Rule: 75.0% GWA required to pass, with no single subject below 50.0%.
 */
export function calculateBleppGwa(grades: SubjectGrades): GwaCalculationResult {
  const devWeight = Number((grades.dev_psych * SUBJECT_WEIGHTS.dev_psych).toFixed(2));
  const assessWeight = Number((grades.psych_assessment * SUBJECT_WEIGHTS.psych_assessment).toFixed(2));
  const abnWeight = Number((grades.abnormal_psych * SUBJECT_WEIGHTS.abnormal_psych).toFixed(2));
  const ioWeight = Number((grades.io_psych * SUBJECT_WEIGHTS.io_psych).toFixed(2));

  const gwa = Number((devWeight + assessWeight + abnWeight + ioWeight).toFixed(2));

  const disqualifiedSubjects: SubjectId[] = [];
  (Object.keys(grades) as SubjectId[]).forEach((subj) => {
    if (grades[subj] < 50) {
      disqualifiedSubjects.push(subj);
    }
  });

  const hasDisqualifyingSubject = disqualifiedSubjects.length > 0;
  const passedOverall = gwa >= 75.0 && !hasDisqualifyingSubject;

  let finalVerdict: GwaCalculationResult['finalVerdict'] = 'FAILED';
  if (passedOverall) {
    finalVerdict = 'PASSED';
  } else if (gwa >= 75.0 && hasDisqualifyingSubject) {
    finalVerdict = 'CONDITIONAL / FAILED (SUB-50 CUTOFF)';
  }

  return {
    gwa,
    passedOverall,
    hasDisqualifyingSubject,
    disqualifiedSubjects,
    finalVerdict,
    weightedContributions: {
      dev_psych: devWeight,
      psych_assessment: assessWeight,
      abnormal_psych: abnWeight,
      io_psych: ioWeight,
    },
  };
}

/**
 * Maps a Bloom's Taxonomy level to the PRC TOS Difficulty Tier
 * Easy (30%): Remembering, Understanding
 * Moderate (40%): Applying
 * Difficult (30%): Analyzing, Evaluating, Creating
 */
export function getDifficultyFromBlooms(blooms: BloomsLevel): DifficultyTier {
  if (blooms === 'Remembering' || blooms === 'Understanding') {
    return 'Easy';
  }
  if (blooms === 'Applying') {
    return 'Moderate';
  }
  return 'Difficult';
}

/**
 * Generates the 6-column x 25-item (150-item) PRC Answer Sheet structure.
 * Column 1: 1-25, Column 2: 26-50, Column 3: 51-75,
 * Column 4: 76-100, Column 5: 101-125, Column 6: 126-150
 */
export interface PrcColumnBlock {
  columnIndex: number; // 1 to 6
  startItem: number;
  endItem: number;
  items: number[];
}

export function buildPrc150SheetColumns(): PrcColumnBlock[] {
  const columns: PrcColumnBlock[] = [];
  for (let col = 0; col < 6; col++) {
    const startItem = col * 25 + 1;
    const endItem = (col + 1) * 25;
    const items: number[] = [];
    for (let i = startItem; i <= endItem; i++) {
      items.push(i);
    }
    columns.push({
      columnIndex: col + 1,
      startItem,
      endItem,
      items,
    });
  }
  return columns;
}

export interface OmrDetectedRow {
  itemNumber: number;
  detectedAnswer: ShadedChoice;
  confidenceNote?: string;
}

export interface ExamAnswerKeyItem {
  itemNumber: number;
  correctChoice: 'A' | 'B' | 'C' | 'D' | 'E';
  sectionCode: string;
  bloomsLevel: BloomsLevel;
}

export interface OmrGradingResult {
  totalExamItems: number;
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  invalidOrMultipleCount: number;
  percentage: number;
  passed75: boolean;
  passed50Cutoff: boolean;
  overShadedItems: number[];
  itemResults: {
    itemNumber: number;
    userChoice: ShadedChoice;
    correctChoice: 'A' | 'B' | 'C' | 'D' | 'E';
    isCorrect: boolean;
    status: 'CORRECT' | 'WRONG' | 'BLANK' | 'INVALID_MARK';
    sectionCode: string;
    difficulty: DifficultyTier;
  }[];
}

/**
 * Grades a 150-item PRC answer sheet scan or interactive shading map against an active exam key.
 * Strictly scores only items 1..totalExamItems, ignores blank unused rows (e.g. 131-150 on a 130-item Psych Assessment test),
 * and flags any accidental over-shaded items past totalExamItems.
 */
export function gradePrcAnswerSheet(
  keyItems: ExamAnswerKeyItem[],
  detectedRows: Record<number, ShadedChoice>
): OmrGradingResult {
  const totalExamItems = keyItems.length;
  let correctCount = 0;
  let incorrectCount = 0;
  let blankCount = 0;
  let invalidOrMultipleCount = 0;

  const itemResults = keyItems.map((keyItem) => {
    const rawChoice = detectedRows[keyItem.itemNumber] || 'BLANK';
    const difficulty = getDifficultyFromBlooms(keyItem.bloomsLevel);

    if (rawChoice === 'BLANK') {
      blankCount++;
      return {
        itemNumber: keyItem.itemNumber,
        userChoice: rawChoice,
        correctChoice: keyItem.correctChoice,
        isCorrect: false,
        status: 'BLANK' as const,
        sectionCode: keyItem.sectionCode,
        difficulty,
      };
    }

    if (rawChoice === 'MULTIPLE_SHADED' || rawChoice === 'ERASURE_OR_INVALID_MARK') {
      invalidOrMultipleCount++;
      return {
        itemNumber: keyItem.itemNumber,
        userChoice: rawChoice,
        correctChoice: keyItem.correctChoice,
        isCorrect: false,
        status: 'INVALID_MARK' as const,
        sectionCode: keyItem.sectionCode,
        difficulty,
      };
    }

    const isCorrect = rawChoice === keyItem.correctChoice;
    if (isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
    }

    return {
      itemNumber: keyItem.itemNumber,
      userChoice: rawChoice,
      correctChoice: keyItem.correctChoice,
      isCorrect,
      status: isCorrect ? ('CORRECT' as const) : ('WRONG' as const),
      sectionCode: keyItem.sectionCode,
      difficulty,
    };
  });

  // Detect any accidental marks past totalExamItems up to 150
  const overShadedItems: number[] = [];
  for (let i = totalExamItems + 1; i <= 150; i++) {
    const mark = detectedRows[i];
    if (mark && mark !== 'BLANK') {
      overShadedItems.push(i);
    }
  }

  const percentage = totalExamItems > 0 ? Number(((correctCount / totalExamItems) * 100).toFixed(2)) : 0;

  return {
    totalExamItems,
    correctCount,
    incorrectCount,
    blankCount,
    invalidOrMultipleCount,
    percentage,
    passed75: percentage >= 75.0,
    passed50Cutoff: percentage >= 50.0,
    overShadedItems,
    itemResults,
  };
}

/**
 * Formats seconds into HH:MM:SS for the 3-hour (180-minute) PRC exam timer.
 */
export function formatExamTimer(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
}

export interface QuestionAttemptLog {
  id: string;
  questionId: string;
  subjectId: SubjectId;
  sectionCode: string; // 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  tosCode: string;
  bloomsLevel: BloomsLevel;
  selectedChoice: 'A' | 'B' | 'C' | 'D' | 'E';
  correctChoice: 'A' | 'B' | 'C' | 'D' | 'E';
  isCorrect: boolean;
  timestamp: number;
  mode: 'practice' | 'mock';
}

export interface TopicPerformanceStat {
  key: string; // `${subjectId}_${sectionCode}`
  subjectId: SubjectId;
  subjectTitle: string;
  sectionId: string;
  sectionLetter: string;
  sectionTitle: string;
  boardWeightPercent: number;
  attempts: number;
  correct: number;
  accuracyPercent: number;
  status: 'STRENGTH' | 'DEVELOPING' | 'WEAKNESS' | 'UNTESTED';
  insight: string;
}

export interface SubjectPerformanceStat {
  subjectId: SubjectId;
  subjectTitle: string;
  boardWeightPercent: number;
  attempts: number;
  correct: number;
  accuracyPercent: number;
  currentMockOrGwaGrade: number;
  status: 'STRENGTH' | 'DEVELOPING' | 'WEAKNESS' | 'UNTESTED';
}

export interface BloomsPerformanceStat {
  tier: DifficultyTier;
  boardSharePercent: number;
  attempts: number;
  correct: number;
  accuracyPercent: number;
  status: 'STRENGTH' | 'DEVELOPING' | 'WEAKNESS' | 'UNTESTED';
  coachingTip: string;
}

export interface StrengthWeaknessReport {
  totalAttempts: number;
  totalCorrect: number;
  overallAccuracyPercent: number;
  strongestSubject: SubjectPerformanceStat | null;
  weakestSubject: SubjectPerformanceStat | null;
  subjectStats: SubjectPerformanceStat[];
  strengths: TopicPerformanceStat[];
  developing: TopicPerformanceStat[];
  weaknesses: TopicPerformanceStat[];
  untestedTopicsCount: number;
  allTopicStats: TopicPerformanceStat[];
  bloomsStats: BloomsPerformanceStat[];
  priorityActionItems: string[];
}

export interface SubjectSectionMeta {
  id: SubjectId;
  fullTitle: string;
  weightPercent: number;
  sections: {
    id: string;
    sectionLetter: string;
    title: string;
    weightPercent: number;
  }[];
}

export interface StrengthWeaknessAnalysisOptions {
  topnotcherMode?: boolean;
  topnotcherThreshold?: number;
  ignoreManualGrades?: boolean;
}

/**
 * Analyzes question attempt logs (always taking the latest attempt per unique questionId
 * so re-drilling a question reflects improvement) to classify Strengths (≥75% standard or ≥topnotcherThreshold),
 * Developing topics, and Weaknesses.
 */
export function analyzeStrengthsAndWeaknesses(
  attemptLogs: QuestionAttemptLog[],
  subjectsMeta: Record<SubjectId, SubjectSectionMeta>,
  grades: SubjectGrades,
  options?: StrengthWeaknessAnalysisOptions
): StrengthWeaknessReport {
  const topnotcherMode = Boolean(options?.topnotcherMode);
  const topnotcherTargetPercent = normalizeTopnotcherThreshold(
    options?.topnotcherThreshold
  );
  const fmtTop = formatThresholdPercent(topnotcherTargetPercent);
  const effectiveGrades = options?.ignoreManualGrades ? ZERO_SUBJECT_GRADES : grades;
  const strengthThreshold = topnotcherMode
    ? topnotcherTargetPercent
    : STANDARD_PASSING_TARGET_PERCENT;
  const developingThreshold = topnotcherMode ? STANDARD_PASSING_TARGET_PERCENT : 60;

  // Deduplicate by questionId keeping the most recent attempt so practicing updates mastery
  const latestByQuestion = new Map<string, QuestionAttemptLog>();
  for (const log of attemptLogs) {
    const existing = latestByQuestion.get(log.questionId);
    if (!existing || log.timestamp >= existing.timestamp) {
      latestByQuestion.set(log.questionId, log);
    }
  }

  const activeLogs = Array.from(latestByQuestion.values());
  const totalAttempts = activeLogs.length;
  const totalCorrect = activeLogs.filter((l) => l.isCorrect).length;
  const overallAccuracyPercent =
    totalAttempts > 0 ? Number(((totalCorrect / totalAttempts) * 100).toFixed(1)) : 0;

  const subjectIds: SubjectId[] = [
    'dev_psych',
    'psych_assessment',
    'abnormal_psych',
    'io_psych',
  ];

  const subjectStats: SubjectPerformanceStat[] = subjectIds.map((subjId) => {
    const meta = subjectsMeta[subjId];
    const subjLogs = activeLogs.filter((l) => l.subjectId === subjId);
    const attempts = subjLogs.length;
    const correct = subjLogs.filter((l) => l.isCorrect).length;
    const accuracyPercent =
      attempts > 0
        ? Number(((correct / attempts) * 100).toFixed(1))
        : effectiveGrades[subjId] > 0
        ? effectiveGrades[subjId]
        : 0;

    const hasData = attempts > 0 || effectiveGrades[subjId] > 0;
    let status: SubjectPerformanceStat['status'] = 'UNTESTED';
    if (hasData) {
      if (accuracyPercent >= strengthThreshold) status = 'STRENGTH';
      else if (accuracyPercent >= developingThreshold) status = 'DEVELOPING';
      else status = 'WEAKNESS';
    }

    return {
      subjectId: subjId,
      subjectTitle: meta.fullTitle,
      boardWeightPercent: meta.weightPercent,
      attempts,
      correct,
      accuracyPercent,
      currentMockOrGwaGrade: effectiveGrades[subjId],
      status,
    };
  });

  const testedSubjects = subjectStats.filter((s) => s.status !== 'UNTESTED');
  const passingSubjectsDesc = testedSubjects
    .filter((s) => s.accuracyPercent >= strengthThreshold)
    .sort((a, b) => b.accuracyPercent - a.accuracyPercent);
  const subPassingSubjectsAsc = testedSubjects
    .filter((s) => s.accuracyPercent < strengthThreshold)
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent);

  const strongestSubject =
    passingSubjectsDesc.length > 0 ? passingSubjectsDesc[0] : null;
  const weakestSubject =
    subPassingSubjectsAsc.length > 0 ? subPassingSubjectsAsc[0] : null;

  const allTopicStats: TopicPerformanceStat[] = [];

  for (const subjId of subjectIds) {
    const meta = subjectsMeta[subjId];
    for (const sec of meta.sections) {
      const secLogs = activeLogs.filter(
        (l) =>
          l.subjectId === subjId &&
          l.sectionCode.trim().toUpperCase() === sec.sectionLetter.toUpperCase()
      );
      const attempts = secLogs.length;
      const correct = secLogs.filter((l) => l.isCorrect).length;
      const accuracyPercent =
        attempts > 0 ? Number(((correct / attempts) * 100).toFixed(1)) : 0;

      let status: TopicPerformanceStat['status'] = 'UNTESTED';
      let insight = `No questions answered yet in Section ${sec.sectionLetter} (${sec.weightPercent}% of ${meta.fullTitle}).`;

      if (attempts > 0) {
        if (accuracyPercent >= strengthThreshold) {
          status = 'STRENGTH';
          insight = topnotcherMode
            ? `Topnotcher-caliber mastery (${accuracyPercent}%). Meets or exceeds the ${fmtTop}% BLEPP Topnotcher standard.`
            : `Board-ready mastery (${accuracyPercent}%). Exceeds the 75% BLEPP passing standard.`;
        } else if (accuracyPercent >= developingThreshold) {
          status = 'DEVELOPING';
          insight = topnotcherMode
            ? `Board-passing (${accuracyPercent}%), needs +${(
                topnotcherTargetPercent - accuracyPercent
              ).toFixed(1)}% to reach the ${fmtTop}% Topnotcher benchmark.`
            : `Borderline (${accuracyPercent}%). Needs +${(75 - accuracyPercent).toFixed(
                1
              )}% to reach the 75% BLEPP target.`;
        } else {
          status = 'WEAKNESS';
          insight = topnotcherMode
            ? `High-priority gap (${accuracyPercent}%). Below the 75% passing floor — strengthen core concepts to protect your Topnotcher GWA.`
            : `High-priority weakness (${accuracyPercent}%). Below the 60% safety margin — review core distinctions and distractor rationales.`;
        }
      }

      allTopicStats.push({
        key: `${subjId}_${sec.sectionLetter}`,
        subjectId: subjId,
        subjectTitle: meta.fullTitle,
        sectionId: sec.id,
        sectionLetter: sec.sectionLetter,
        sectionTitle: sec.title,
        boardWeightPercent: sec.weightPercent,
        attempts,
        correct,
        accuracyPercent,
        status,
        insight,
      });
    }
  }

  const strengths = allTopicStats
    .filter((t) => t.status === 'STRENGTH')
    .sort((a, b) => b.accuracyPercent - a.accuracyPercent);

  const developing = allTopicStats
    .filter((t) => t.status === 'DEVELOPING')
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent);

  const weaknesses = allTopicStats
    .filter((t) => t.status === 'WEAKNESS')
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent || b.boardWeightPercent - a.boardWeightPercent);

  const untestedTopicsCount = allTopicStats.filter((t) => t.status === 'UNTESTED').length;

  const tiers: { tier: DifficultyTier; share: number; tip: string }[] = [
    {
      tier: 'Easy',
      share: 30,
      tip: 'Focus on foundational terminology, key theorists, and statutory definitions (RA 11036, PAP Code of Ethics).',
    },
    {
      tier: 'Moderate',
      share: 40,
      tip: 'Practice situational Philippine case vignettes—identify age/stage clues, workplace scenarios, and test administration protocols.',
    },
    {
      tier: 'Difficult',
      share: 30,
      tip: 'Slow down on differential diagnosis (DSM-5-TR duration/specifiers), psychometric critique (reliability vs. validity), and ethical dilemmas.',
    },
  ];

  const bloomsStats: BloomsPerformanceStat[] = tiers.map(({ tier, share, tip }) => {
    const tierLogs = activeLogs.filter((l) => getDifficultyFromBlooms(l.bloomsLevel) === tier);
    const attempts = tierLogs.length;
    const correct = tierLogs.filter((l) => l.isCorrect).length;
    const accuracyPercent =
      attempts > 0 ? Number(((correct / attempts) * 100).toFixed(1)) : 0;

    let status: BloomsPerformanceStat['status'] = 'UNTESTED';
    if (attempts > 0) {
      if (accuracyPercent >= strengthThreshold) status = 'STRENGTH';
      else if (accuracyPercent >= developingThreshold) status = 'DEVELOPING';
      else status = 'WEAKNESS';
    }

    return {
      tier,
      boardSharePercent: share,
      attempts,
      correct,
      accuracyPercent,
      status,
      coachingTip: tip,
    };
  });

  const priorityActionItems: string[] = [];
  if (weaknesses.length > 0) {
    const topWeak = weaknesses[0];
    priorityActionItems.push(
      `Prioritize ${topWeak.subjectTitle} — Section ${topWeak.sectionLetter}: ${topWeak.sectionTitle} (${topWeak.accuracyPercent}% accuracy, ${topWeak.boardWeightPercent}% subject weight).`
    );
  }
  if (developing.length > 0) {
    const topDev = developing[0];
    priorityActionItems.push(
      topnotcherMode
        ? `Push ${topDev.subjectTitle} — Section ${topDev.sectionLetter} (${topDev.accuracyPercent}%) above the ${topnotcherTargetPercent.toFixed(1)}% BLEPP Topnotcher line.`
        : `Push ${topDev.subjectTitle} — Section ${topDev.sectionLetter} (${topDev.accuracyPercent}%) above the 75.0% BLEPP passing line.`
    );
  }
  const weakBlooms = bloomsStats.find((b) => b.status === 'WEAKNESS');
  if (weakBlooms) {
    priorityActionItems.push(
      `Strengthen ${weakBlooms.tier}-tier questions (${weakBlooms.accuracyPercent}% accuracy, ${weakBlooms.boardSharePercent}% of board exam): ${weakBlooms.coachingTip}`
    );
  }
  if (priorityActionItems.length === 0) {
    if (totalAttempts === 0) {
      priorityActionItems.push(
        'Answer a Practice Quiz or Mock Exam in any subject to unlock your personalized PRC TOS Weakness & Strength diagnostics.'
      );
    } else {
      priorityActionItems.push(
        `Maintain your ${overallAccuracyPercent}% accuracy and drill remaining untested PRC TOS sections (${untestedTopicsCount} sections left).`
      );
    }
  }

  return {
    totalAttempts,
    totalCorrect,
    overallAccuracyPercent,
    strongestSubject,
    weakestSubject,
    subjectStats,
    strengths,
    developing,
    weaknesses,
    untestedTopicsCount,
    allTopicStats,
    bloomsStats,
    priorityActionItems,
  };
}

export interface AdaptiveTipInput {
  stem?: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctChoice: 'A' | 'B' | 'C' | 'D';
  tosCode: string;
  bloomsLevel: BloomsLevel;
  rationale: string;
  optionRationales?: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  examTip?: string;
  adaptiveTips?: {
    correctTip?: string;
    misconceptionTips?: {
      A?: string;
      B?: string;
      C?: string;
      D?: string;
    };
  };
}

export interface AdaptiveTipResult {
  variant: 'correct' | 'misconception';
  headline: string;
  body: string;
}

function stripLegacyBoilerplate(text?: string): string {
  if (!text) return '';
  return text
    .replace(/\s*Bonus Takeaway:\s*Watch for timeframe, age, or PAP ethical qualifiers that flip look-alike choices\.?/gi, '')
    .replace(/\s*Bonus Takeaway:\s*Double-check timeframe, age range, or ethical clauses on similar items\.?/gi, '')
    .trim();
}

/**
 * Generates an adaptive BLEPP Board Exam Tip strictly AFTER an answer is submitted:
 * - If the user's submitted choice matches correctChoice, provides a context-grounded
 *   expansion/summary of why the correct option is the BEST answer over look-alike or partial choices.
 * - If the user's submitted choice is wrong (or blank/invalid), clears the specific misconception
 *   by explaining why the chosen option falls short in the context of the question stem.
 */
export function buildAdaptiveExamTip(
  question: AdaptiveTipInput,
  submittedChoice: ShadedChoice
): AdaptiveTipResult {
  const correctLetter = question.correctChoice;
  const correctLabel = question.options[correctLetter];
  const otherLetters = (['A', 'B', 'C', 'D'] as const).filter((k) => k !== correctLetter);
  const otherSummary = otherLetters
    .map((k) => `[${k}] "${question.options[k]}"`)
    .join(', ');

  const cleanExamTip = stripLegacyBoilerplate(question.examTip);
  const cleanCorrectTip = stripLegacyBoilerplate(question.adaptiveTips?.correctTip);
  const cleanKeyedOptionRationale = stripLegacyBoilerplate(
    question.optionRationales?.[correctLetter]
  );

  if (submittedChoice === correctLetter) {
    let body = cleanCorrectTip;
    if (!body) {
      if (cleanExamTip && cleanExamTip.length >= 45) {
        body = cleanExamTip;
      } else if (cleanExamTip && cleanKeyedOptionRationale) {
        body = `${cleanKeyedOptionRationale} ${cleanExamTip}`;
      } else if (cleanExamTip) {
        body = `${cleanExamTip} That specific context in the question makes [${correctLetter}] ("${correctLabel}") a fuller fit than partial or look-alike alternatives (${otherSummary}).`;
      } else if (cleanKeyedOptionRationale) {
        body = `${cleanKeyedOptionRationale} That makes [${correctLetter}] ("${correctLabel}") the best answer over partial or look-alike alternatives (${otherSummary}).`;
      } else {
        body = `[${correctLetter}] ("${correctLabel}") is the best answer because it satisfies all key conditions in the question's context, whereas competing choices (${otherSummary}) address only a partial aspect or a different scenario.`;
      }
    }

    return {
      variant: 'correct',
      headline: `BLEPP Mastery Tip · Why [${correctLetter}] Is the Best Fit`,
      body,
    };
  }

  if (
    submittedChoice === 'A' ||
    submittedChoice === 'B' ||
    submittedChoice === 'C' ||
    submittedChoice === 'D'
  ) {
    const pickedLabel = question.options[submittedChoice];
    const customMisconception = stripLegacyBoilerplate(
      question.adaptiveTips?.misconceptionTips?.[submittedChoice]
    );
    const rawDistractorNote = stripLegacyBoilerplate(
      question.optionRationales?.[submittedChoice]
    );
    const cleanedDistractorNote = rawDistractorNote
      ? rawDistractorNote.replace(/^INCORRECT DISTRACTOR:\s*/i, '').trim()
      : '';

    let bodyText: string;
    if (customMisconception) {
      bodyText = customMisconception;
    } else if (cleanedDistractorNote && cleanExamTip) {
      bodyText = `${cleanedDistractorNote} ${cleanExamTip}`;
    } else if (cleanedDistractorNote) {
      bodyText = `${cleanedDistractorNote} In this question's context, [${correctLetter}] ("${correctLabel}") is the stronger match because it accounts for every detail in the stem.`;
    } else if (cleanExamTip) {
      bodyText = `"${pickedLabel}" can look plausible in isolation, but it misses the decisive context in this stem. ${cleanExamTip}`;
    } else {
      bodyText = `"${pickedLabel}" only partially overlaps or applies to a different condition than what is described here, whereas [${correctLetter}] ("${correctLabel}") directly matches the full context of the stem.`;
    }

    return {
      variant: 'misconception',
      headline: `Why [${submittedChoice}] ("${pickedLabel}") Is Not the Best Fit Here`,
      body: bodyText,
    };
  }

  return {
    variant: 'misconception',
    headline: `Unanswered / Invalid Mark (${submittedChoice})`,
    body: `BLEPP has no right-minus-wrong penalty—anchor on the stem's specific context to eliminate partial look-alikes and select [${correctLetter}] ("${correctLabel}").${
      cleanExamTip ? ` ${cleanExamTip}` : ''
    }`,
  };
}

export const FLASHCARD_DECK_SIZE = 5;
export const PRACTICE_QUIZ_SIZE = 15;
export const QUIZ_ITEM_COUNT_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50] as const;
export const MIN_QUIZ_ITEM_COUNT = 5;
export const MAX_QUIZ_ITEM_COUNT = 50;
export const MOCK_EXAM_SIZE = 100;
export const PSYCH_ASSESSMENT_MOCK_EXAM_SIZE = 130;
export const MOCK_EXAM_DURATION_MINUTES = 180;

export function getSubjectMockExamSize(subjectId: SubjectId): number {
  return subjectId === 'psych_assessment'
    ? PSYCH_ASSESSMENT_MOCK_EXAM_SIZE
    : MOCK_EXAM_SIZE;
}

export function normalizeQuizItemCount(
  value?: number | null,
  fallback = PRACTICE_QUIZ_SIZE
): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  return Math.min(MAX_QUIZ_ITEM_COUNT, Math.max(MIN_QUIZ_ITEM_COUNT, rounded));
}

export interface PracticeQuizSubBatchPlan {
  batchIndex: number;
  count: number;
  competencySubsetText: string;
  batchFocusHint: string;
}

/**
 * Splits a Section or Practice Quiz (5 to 50 items) into fast parallel sub-batches (each <= 6 items,
 * with a 2–3 item lead worker for near-instant Item #1 display plus a deduplication buffer) and
 * assigns each worker a distinct cognitive/scenario slice + competency subset so workers never
 * generate colliding stems or time out on heavy sections (like Abnormal Psych Section B DSM-5).
 */
const LOCKED_SECTION_WORKER_PARTITIONS: Record<string, [string, string, string, string]> = {
  dev_psych_A: [
    'ASSIGNED SUB-TOPIC BUCKET (DO NOT OVERLAP OTHER WORKERS): Focus strictly on Genetic Foundations, Genotype vs. Phenotype, Dominant/Recessive/Polygenic Inheritance, and Biological Maturation vs. Learning. Do NOT write items whose keyed answer is Passive/Evocative/Active rGE, Canalization, or Reaction Range (reserved for Workers 3 & 4).',
    'ASSIGNED SUB-TOPIC BUCKET (DO NOT OVERLAP OTHER WORKERS): Focus strictly on Twin Studies (Monozygotic vs. Dizygotic concordance), Adoption Studies, Heritability Estimates, and Shared vs. Nonshared Family Environments. Do NOT write items whose keyed answer is Passive/Evocative/Active rGE or Canalization (reserved for Workers 3 & 4).',
    'ASSIGNED SUB-TOPIC BUCKET (DO NOT OVERLAP OTHER WORKERS): Focus strictly on Scarr & McCartney Genotype-Environment Correlations and Gene × Environment (G×E) Interaction — generate at most 1 Passive rGE item, 1 Evocative/Reactive rGE item, 1 Active (niche-picking) rGE item, and 1 G×E Interaction item using 4 completely different everyday domains (e.g., athletics, reading, temperament, stress resilience).',
    'ASSIGNED SUB-TOPIC BUCKET (DO NOT OVERLAP OTHER WORKERS): Focus strictly on Canalization (1 item), Reaction Range / Range of Reaction (1 item), Epigenetics / Environmental Gene Expression (1 item), and Differentiating Heredity-Driven vs. Environment-Shaped Characteristics (2 items). Every item in this batch must have a different correct concept.',
  ],
};

export function buildPracticeQuizParallelBatches(
  competencyDetails: string,
  difficultyFilter = 'TOS_PROPORTIONAL',
  totalQuizSize = PRACTICE_QUIZ_SIZE,
  lockedSectionContext?: {
    subjectId?: SubjectId;
    sectionLetter: string;
    sectionTitle: string;
  }
): PracticeQuizSubBatchPlan[] {
  const targetSize = normalizeQuizItemCount(totalQuizSize, PRACTICE_QUIZ_SIZE);
  const lines = (competencyDetails || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let counts: number[];
  if (targetSize <= 8) {
    const c1 = Math.max(2, Math.floor(targetSize / 2));
    const c2 = Math.max(2, targetSize - c1 + 1);
    counts = [c1, c2];
  } else if (targetSize <= 18) {
    const c1 = Math.max(1, Math.floor(targetSize / 5)); // 3 items for 15 (ultra-fast first paint)
    const remainingAfterC1 = Math.max(3, targetSize - c1);
    const c2 = Math.max(1, Math.floor(remainingAfterC1 / 3));
    const c3 = Math.max(1, Math.floor((remainingAfterC1 - c2) / 2));
    // +1 buffer on Worker 4 to absorb any rare cross-batch stem similarity in one wave
    const c4 = Math.max(1, targetSize - c1 - c2 - c3 + 1);
    counts = [c1, c2, c3, c4];
  } else {
    // Larger Section Quizzes (20..50 items): keep Worker 1 at 3 items for instant first paint,
    // and cap every subsequent worker at <= 6 items so no single Gemini call ever stalls.
    const c1 = 3;
    const totalWithBuffer = targetSize + 2;
    const remaining = totalWithBuffer - c1;
    const extraWorkers = Math.ceil(remaining / 6);
    const baseCount = Math.floor(remaining / extraWorkers);
    const extraRemainder = remaining - baseCount * extraWorkers;
    counts = [c1];
    for (let i = 0; i < extraWorkers; i++) {
      counts.push(
        i >= extraWorkers - extraRemainder ? baseCount + 1 : baseCount
      );
    }
  }

  const numWorkers = counts.length;

  const subsetForWorker = (workerIdx: number): string => {
    if (lines.length >= numWorkers) {
      const assigned = lines.filter((_, idx) => idx % numWorkers === workerIdx);
      if (assigned.length > 0) {
        return assigned.join('\n');
      }
    }
    if (lines.length > 1) {
      const primaryIdx = workerIdx % lines.length;
      const secondaryIdx = (workerIdx + 1) % lines.length;
      const spotlight =
        lines.length >= 4 && numWorkers > lines.length
          ? `${lines[primaryIdx]}\n${lines[secondaryIdx]}`
          : lines[primaryIdx];
      return `Primary Competency Spotlight for Worker ${workerIdx + 1} of ${numWorkers}:\n${spotlight}\nAll Allowed Section Competencies:\n${competencyDetails}`;
    }
    return competencyDetails;
  };

  const scopeAnchor = lockedSectionContext
    ? `exclusively within Section ${lockedSectionContext.sectionLetter} (${lockedSectionContext.sectionTitle}) — NEVER introduce concepts, stages, theories, methods, or ethics from any other section`
    : 'strictly within the assigned competencies above';

  const partitionKey =
    lockedSectionContext?.subjectId && lockedSectionContext.sectionLetter
      ? `${lockedSectionContext.subjectId}_${lockedSectionContext.sectionLetter.trim().toUpperCase()}`
      : '';
  const customBuckets = partitionKey ? LOCKED_SECTION_WORKER_PARTITIONS[partitionKey] : undefined;

  const uniqueAnswerRule =
    'Every item in your sub-batch MUST test a DIFFERENT keyed concept/answer choice (never repeat the same correct concept twice in your batch).';

  const buildHintForWorker = (workerIdx: number): string => {
    const angleIdx = workerIdx % 4;
    const wavePass = Math.floor(workerIdx / 4);
    const waveVarietyNote =
      wavePass > 0
        ? ` (Wave Set ${wavePass + 1}: use fresh clinical/educational/workplace cases and disorder subtypes distinct from Set 1)`
        : '';
    const bucketText = customBuckets ? customBuckets[angleIdx] : '';

    if (difficultyFilter === 'TOS_PROPORTIONAL') {
      if (angleIdx === 0) {
        return `Worker ${workerIdx + 1} of ${numWorkers}${waveVarietyNote} — Core Concepts, Definitions & Key Characteristics (Easy / Remembering & Understanding): Set bloomsLevel to "Remembering" or "Understanding" ONLY and write each stem in that level's required form (no long vignettes). Generate crisp conceptual distinctions, foundational mechanisms, and hallmark characteristics ${scopeAnchor}. ${bucketText || 'Focus on foundational terminology, definitions, and core distinctions.'} ${uniqueAnswerRule}`;
      }
      if (angleIdx === 1) {
        return `Worker ${workerIdx + 1} of ${numWorkers}${waveVarietyNote} — Everyday Home & Community Scenarios (Moderate / Applying): Set bloomsLevel to "Applying" ONLY — each stem is a short case where a named rule/criterion must be applied. Generate realistic situational vignettes in Philippine home or community settings illustrating mechanisms ${scopeAnchor}, ensuring all 4 options also belong to this exact scope. ${bucketText || 'Use family, community, or interpersonal settings.'} ${uniqueAnswerRule}`;
      }
      if (angleIdx === 2) {
        return `Worker ${workerIdx + 1} of ${numWorkers}${waveVarietyNote} — School, Clinic & Workplace Applied Vignettes (Moderate / Applying & Analyzing): Set bloomsLevel to "Applying" or "Analyzing". Generate practical applied cases contrasting two closely related concepts ${scopeAnchor}, with zero spillover into later or adjacent sections. ${bucketText || 'Use school, organizational, or assessment-relevant settings within this section.'} ${uniqueAnswerRule}`;
      }
      return `Worker ${workerIdx + 1} of ${numWorkers}${waveVarietyNote} — Nuanced Differential Analysis & Look-Alike Qualifiers (Difficult / Analyzing & Evaluating): Set bloomsLevel to "Analyzing" or "Evaluating" ONLY and write each stem in that level's required form (judging, justifying or differentiating — not just spotting a keyword). Generate multi-cue items contrasting subtle look-alike or partial-fit choices ${scopeAnchor} — do NOT pull research designs, stage tasks, diagnostic rules, or ethics codes unless they are explicitly part of this section's listed competencies. ${bucketText || 'Contrast subtle qualifiers separating close concepts inside this section.'} ${uniqueAnswerRule}`;
    }

    const angleLabels = ['Angle A', 'Angle B', 'Angle C', 'Angle D'];
    const angleDescriptions = [
      'Focus on core definitions, foundational mechanisms, and hallmark characteristics',
      'Focus on applied individual or family scenarios in Philippine settings',
      'Focus on applied comparative scenarios contrasting two concepts',
      'Focus on nuanced look-alike distinctions and contextual qualifiers',
    ];
    return `Worker ${workerIdx + 1} of ${numWorkers}${waveVarietyNote} (${difficultyFilter}) — ${angleLabels[angleIdx]}: ${angleDescriptions[angleIdx]} ${scopeAnchor}. ${bucketText} ${uniqueAnswerRule}`;
  };

  return counts.map((count, idx) => ({
    batchIndex: idx + 1,
    count,
    competencySubsetText: subsetForWorker(idx),
    batchFocusHint: buildHintForWorker(idx),
  }));
}

export interface PracticeSessionState {
  draftChoices: Record<string, 'A' | 'B' | 'C' | 'D'>;
  submittedAnswers: Record<string, 'A' | 'B' | 'C' | 'D'>;
  selectedScope: string;
  targetItemCount?: number;
  sectionItemCounts?: Record<string, number>;
  activeQuestionIds?: string[];
  completedAt?: number;
  updatedAt: number;
}

export interface MockSessionState {
  shadedMap: Record<number, ShadedChoice>;
  flaggedItems: Record<number, boolean>;
  examSecondsLeft: number;
  mockSubmitted: boolean;
  examineeName: string;
  questionSet: 'A' | 'B';
  mockViewLayout: 'split' | 'full_prc_sheet';
  selectedScope: string;
  activeQuestionIds?: string[];
  updatedAt: number;
}

export interface SubjectSessionProgress {
  practice: PracticeSessionState;
  mock: MockSessionState;
}

export function createEmptySubjectSession(
  examDurationMinutes = MOCK_EXAM_DURATION_MINUTES
): SubjectSessionProgress {
  return {
    practice: {
      draftChoices: {},
      submittedAnswers: {},
      selectedScope: 'ALL',
      targetItemCount: PRACTICE_QUIZ_SIZE,
      sectionItemCounts: {},
      activeQuestionIds: undefined,
      completedAt: 0,
      updatedAt: 0,
    },
    mock: {
      shadedMap: {},
      flaggedItems: {},
      examSecondsLeft: examDurationMinutes * 60,
      mockSubmitted: false,
      examineeName: '',
      questionSet: 'A',
      mockViewLayout: 'split',
      selectedScope: 'ALL',
      activeQuestionIds: undefined,
      updatedAt: 0,
    },
  };
}

/**
 * Extracts a clean uppercase section letter ('A'..'F') from raw labels like
 * "A", "Section A", "Sec B · 1.2", or "dev_C".
 */
export function normalizeSectionLetter(raw?: string, fallback = 'A'): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (/^[A-Za-z]$/.test(trimmed)) return trimmed.toUpperCase();
  const secMatch = trimmed.match(/^(?:section|sec)\.?\s*([A-Fa-f])\b/i);
  if (secMatch) return secMatch[1].toUpperCase();
  const suffixMatch = trimmed.match(/_([A-Fa-f])(?:_|$)/);
  if (suffixMatch) return suffixMatch[1].toUpperCase();
  const leadMatch = trimmed.match(/^([A-Fa-f])\s*[.·:-]/);
  if (leadMatch) return leadMatch[1].toUpperCase();
  return fallback;
}

export interface QuestionScopeStub {
  id: string;
  sectionCode: string;
}

/**
 * Filters questions strictly to the active batch (if activeQuestionIds is provided)
 * and strictly to the selected section when scopeKey !== 'ALL'.
 * Never leaks items from other sections (e.g. B or C) into a Section A quiz.
 */
export function filterQuestionsStrictByScope<T extends QuestionScopeStub>(
  questions: T[],
  scopeKey: string,
  sections: { id: string; sectionLetter: string }[],
  activeQuestionIds?: string[]
): T[] {
  let pool = questions;
  if (activeQuestionIds && activeQuestionIds.length > 0) {
    const byId = new Map(questions.map((q) => [q.id, q]));
    const ordered = activeQuestionIds
      .map((id) => byId.get(id))
      .filter((q): q is T => Boolean(q));
    if (ordered.length > 0) {
      pool = ordered;
    }
  }

  if (!scopeKey || scopeKey === 'ALL') {
    return pool;
  }

  const sec = sections.find((s) => s.id === scopeKey);
  if (!sec) {
    return pool;
  }

  const targetLetter = sec.sectionLetter.trim().toUpperCase();
  return pool.filter(
    (q) => normalizeSectionLetter(q.sectionCode, '') === targetLetter
  );
}

export function normalizeStemForComparison(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSignificantTokens(normalizedText: string): Set<string> {
  const stop = new Set([
    'which',
    'what',
    'when',
    'where',
    'following',
    'according',
    'most',
    'best',
    'accurate',
    'psychologist',
    'psychometrician',
    'registered',
    'client',
    'patient',
    'year',
    'years',
    'from',
    'that',
    'this',
    'with',
    'have',
    'been',
    'into',
    'their',
    'they',
    'describes',
    'demonstrates',
    'illustrates',
  ]);
  const tokens = normalizedText
    .split(' ')
    .filter((w) => w.length >= 4 && !stop.has(w));
  return new Set(tokens);
}

export function areStemsTooSimilar(stemA: string, stemB: string): boolean {
  const normA = normalizeStemForComparison(stemA);
  const normB = normalizeStemForComparison(stemB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  if (normA.length >= 55 && normB.length >= 55) {
    const prefixA = normA.slice(0, 55);
    const prefixB = normB.slice(0, 55);
    if (prefixA === prefixB) return true;
  }

  const setA = extractSignificantTokens(normA);
  const setB = extractSignificantTokens(normB);
  if (setA.size >= 5 && setB.size >= 5) {
    let intersection = 0;
    for (const tok of setA) {
      if (setB.has(tok)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    if (union > 0 && intersection / union >= 0.72) {
      return true;
    }
  }

  return false;
}

function optionSetTokens(options: Partial<Record<'A' | 'B' | 'C' | 'D', string>> | undefined): Set<string> {
  const text = (['A', 'B', 'C', 'D'] as const)
    .map((l) => String(options?.[l] ?? ''))
    .join(' ')
    .toLowerCase();
  return new Set(text.match(/[a-z]{4,}/g) || []);
}

/** True when two items use (almost) the same four options, e.g. the same template with a different name in the stem. */
export function areOptionSetsTooSimilar(
  a: Partial<Record<'A' | 'B' | 'C' | 'D', string>> | undefined,
  b: Partial<Record<'A' | 'B' | 'C' | 'D', string>> | undefined
): boolean {
  const setA = optionSetTokens(a);
  const setB = optionSetTokens(b);
  if (setA.size < 6 || setB.size < 6) return false;
  let intersection = 0;
  for (const tok of setA) {
    if (setB.has(tok)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 && intersection / union >= 0.6;
}

/**
 * Removes any incoming questions whose stems repeat or closely paraphrase
 * previously seen stems or earlier items in the same incoming batch. When the
 * already-accepted items are passed in, items that reuse almost the same four
 * options as an earlier item are removed too.
 */
export function deduplicateQuestions<
  T extends { stem: string; options?: Partial<Record<'A' | 'B' | 'C' | 'D', string>> }
>(
  incoming: T[],
  existingStems: string[],
  existingItems: Array<{ options?: Partial<Record<'A' | 'B' | 'C' | 'D', string>> }> = []
): T[] {
  const accepted: T[] = [];
  const referenceStems = [...existingStems];
  const referenceOptionSets = existingItems.map((q) => q.options);

  for (const item of incoming) {
    if (!item?.stem || !item.stem.trim()) continue;
    const isDup =
      referenceStems.some((prevStem) => areStemsTooSimilar(item.stem, prevStem)) ||
      referenceOptionSets.some((prevOptions) => areOptionSetsTooSimilar(item.options, prevOptions));
    if (!isDup) {
      accepted.push(item);
      referenceStems.push(item.stem);
      referenceOptionSets.push(item.options);
    }
  }

  return accepted;
}

export function deduplicateFlashcards<T extends { term: string }>(
  incoming: T[],
  existingTerms: string[]
): T[] {
  const seen = new Set(existingTerms.map((t) => normalizeStemForComparison(t)));
  const accepted: T[] = [];
  for (const card of incoming) {
    const key = normalizeStemForComparison(card?.term || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    accepted.push(card);
  }
  return accepted;
}

export interface MockSectionBatchPlan {
  batchIndex: number;
  sectionId: string;
  sectionLetter: string;
  sectionTitle: string;
  count: number;
}

/**
 * Splits a 100-item Mock Exam proportionally across a subject's PRC TOS sections
 * using largest-remainder rounding, chunking large sections into <=25-item batches
 * for fast, reliable generation without token truncation.
 */
export function buildMockExamSectionBatches(
  sections: {
    id: string;
    sectionLetter: string;
    title: string;
    weightPercent: number;
  }[],
  totalItems = MOCK_EXAM_SIZE,
  maxBatchSize = 25
): MockSectionBatchPlan[] {
  if (sections.length === 0) return [];
  const totalWeight =
    sections.reduce((acc, s) => acc + Math.max(0, s.weightPercent), 0) || 100;

  const rawQuotas = sections.map((sec) => {
    const exact = (Math.max(0, sec.weightPercent) / totalWeight) * totalItems;
    const floored = Math.floor(exact);
    return {
      sec,
      floored,
      remainder: exact - floored,
    };
  });

  let allocated = rawQuotas.reduce((sum, q) => sum + q.floored, 0);
  const byRemainder = [...rawQuotas].sort((a, b) => b.remainder - a.remainder);
  let rIdx = 0;
  while (allocated < totalItems && byRemainder.length > 0) {
    byRemainder[rIdx % byRemainder.length].floored += 1;
    allocated += 1;
    rIdx += 1;
  }

  const batches: MockSectionBatchPlan[] = [];
  let batchIndex = 1;

  for (const { sec, floored } of rawQuotas) {
    let remaining = floored;
    while (remaining > 0) {
      const chunk = Math.min(maxBatchSize, remaining);
      batches.push({
        batchIndex: batchIndex++,
        sectionId: sec.id,
        sectionLetter: sec.sectionLetter,
        sectionTitle: sec.title,
        count: chunk,
      });
      remaining -= chunk;
    }
  }

  return batches;
}

/**
 * Splits a Full-Subject quiz across sections by official TOS weight (largest-remainder rounding).
 * - Ties and leftover items go to the sections you have practiced least (answeredBySection).
 * - When the quiz is large enough, every section gets at least one item.
 * - When it is smaller than the number of sections, the least-practiced, heaviest sections are chosen.
 */
export function allocateAllScopeQuotas(
  sections: { id: string; weightPercent: number }[],
  totalItems: number,
  answeredBySection: Record<string, number> = {}
): Record<string, number> {
  const quotas: Record<string, number> = {};
  for (const sec of sections) quotas[sec.id] = 0;
  if (sections.length === 0 || totalItems <= 0) return quotas;

  const totalWeight = sections.reduce((a, sec) => a + Math.max(0, sec.weightPercent), 0) || sections.length;
  const totalAnswered = sections.reduce((a, sec) => a + (answeredBySection[sec.id] || 0), 0);
  const rows = sections.map((sec) => {
    const share = (Math.max(0, sec.weightPercent) || 1) / totalWeight;
    const exact = share * totalItems;
    const answered = answeredBySection[sec.id] || 0;
    return {
      sec,
      share,
      floored: Math.floor(exact),
      remainder: exact - Math.floor(exact),
      // positive = this section is under-practiced relative to its exam weight
      deficit: share * (totalAnswered + totalItems) - answered,
    };
  });

  if (totalItems < sections.length) {
    const picked = [...rows]
      .sort((a, b) => b.deficit - a.deficit || b.share - a.share)
      .slice(0, totalItems);
    for (const row of picked) quotas[row.sec.id] = 1;
    return quotas;
  }

  let allocated = rows.reduce((sum, r) => sum + r.floored, 0);
  for (const r of rows) quotas[r.sec.id] = r.floored;
  const order = [...rows].sort((a, b) => b.remainder - a.remainder || b.deficit - a.deficit);
  let idx = 0;
  while (allocated < totalItems) {
    quotas[order[idx % order.length].sec.id] += 1;
    allocated += 1;
    idx += 1;
  }

  // Every section gets at least one item: take it from the largest quota (preferring the most-practiced one)
  for (const r of [...rows].sort((a, b) => b.deficit - a.deficit)) {
    if (quotas[r.sec.id] > 0) continue;
    const donor = [...rows]
      .filter((d) => quotas[d.sec.id] > 1)
      .sort((a, b) => quotas[b.sec.id] - quotas[a.sec.id] || a.deficit - b.deficit)[0];
    if (!donor) break;
    quotas[donor.sec.id] -= 1;
    quotas[r.sec.id] += 1;
  }

  return quotas;
}

export interface QuizCompletionEvaluation {
  totalItems: number;
  answeredCount: number;
  correctCount: number;
  accuracyPercent: number;
  isAllAnswered: boolean;
  targetSection: {
    id: string;
    sectionLetter: string;
    title: string;
    competencyIds: string[];
  } | null;
  clearedSections: {
    id: string;
    sectionLetter: string;
    title: string;
    competencyIds: string[];
  }[];
  clearedCompetencyIds: string[];
}

/** Mastery needs BOTH a high score and enough answers behind it, so one lucky answer never counts as mastery. */
export const COMPETENCY_MASTERY_THRESHOLD_PERCENT = 75;
/** Answers needed on a goal before it can be marked mastered. */
export const COMPETENCY_MASTERY_MIN_ITEMS = 4;
/** Below this many answers a goal shows only its raw score ("too few answers"), not a mastery tier. */
export const COMPETENCY_MIN_ANSWERS_FOR_TIER = 3;
// Mastery is shrunk toward 50% as if every goal started with 4 neutral answers (2 right, 2 wrong):
// 1/1 -> 60%, 2/2 -> 67%, 4/4 -> 75%, 8/8 -> 83%, 3/6 -> 50%.
const MASTERY_PRIOR_CORRECT = 2;
const MASTERY_PRIOR_ATTEMPTS = 4;

/** Confidence-adjusted mastery percentage (null when there are no answers yet). */
export function adjustedMasteryPercent(correct: number, attempts: number): number | null {
  if (attempts <= 0) return null;
  return Math.round(((correct + MASTERY_PRIOR_CORRECT) / (attempts + MASTERY_PRIOR_ATTEMPTS)) * 100);
}

/** Pulls "1.1"-style competency numbers out of codes like "1.1", "A 1.1" or "Section A 1.1". */
export function extractCompetencyCode(raw?: string | null): string | null {
  if (!raw) return null;
  const m = String(raw).match(/(\d+)\s*\.\s*(\d+)/);
  return m ? `${Number(m[1])}.${Number(m[2])}` : null;
}

export interface MasteryStat {
  attempts: number;
  correct: number;
  /** Raw accuracy; null when there is no data yet */
  accuracyPercent: number | null;
  /** Confidence-adjusted mastery (what the Syllabus shows); null when there is no data yet */
  masteryPercent: number | null;
  /** True once there are enough answers to show a mastery tier */
  hasEnoughData: boolean;
}

export interface SectionMasteryStat extends MasteryStat {
  practicedGoals: number;
  totalGoals: number;
}

/**
 * Evaluates current Practice Quiz progress. A TOS competency (goal) is auto-cleared only on real evidence:
 * at least COMPETENCY_MASTERY_MIN_ITEMS saved answers on it AND confidence-adjusted mastery >= 75%, using the
 * cumulative stats when provided (otherwise only this quiz's answers). Finishing a quiz alone clears nothing.
 */
export function evaluateQuizCompletionAndSectionGoals(
  displayedQuestions: {
    id: string;
    sectionCode: string;
    correctChoice: 'A' | 'B' | 'C' | 'D';
    tosCode?: string;
  }[],
  submittedAnswers: Record<string, 'A' | 'B' | 'C' | 'D'>,
  selectedScope: string,
  sections: {
    id: string;
    sectionLetter: string;
    title: string;
    competencies: { id: string; code?: string }[];
  }[],
  cumulativeByCompetency?: Record<string, { attempts: number; correct: number }>
): QuizCompletionEvaluation {
  const totalItems = displayedQuestions.length;
  let answeredCount = 0;
  let correctCount = 0;

  for (const q of displayedQuestions) {
    const sub = submittedAnswers[q.id];
    if (sub) {
      answeredCount++;
      if (sub === q.correctChoice) {
        correctCount++;
      }
    }
  }

  const accuracyPercent =
    answeredCount > 0 ? Number(((correctCount / answeredCount) * 100).toFixed(1)) : 0;
  const isAllAnswered = totalItems > 0 && answeredCount >= totalItems;

  const explicitTargetSec =
    selectedScope && selectedScope !== 'ALL'
      ? sections.find((s) => s.id === selectedScope) || null
      : null;

  const targetSection = explicitTargetSec
    ? {
        id: explicitTargetSec.id,
        sectionLetter: explicitTargetSec.sectionLetter,
        title: explicitTargetSec.title,
        competencyIds: explicitTargetSec.competencies.map((c) => c.id),
      }
    : null;

  const clearedSections: QuizCompletionEvaluation['clearedSections'] = [];
  const clearedCompetencyIdSet = new Set<string>();

  if (isAllAnswered) {
    for (const sec of sections) {
      const secLetter = sec.sectionLetter.trim().toUpperCase();
      const secQs = displayedQuestions.filter(
        (q) => normalizeSectionLetter(q.sectionCode, '') === secLetter
      );
      if (secQs.length === 0) continue;

      const clearedHere: string[] = [];
      for (const comp of sec.competencies) {
        const compCode = extractCompetencyCode(comp.code);
        if (!compCode) continue;
        const compQs = secQs.filter((q) => extractCompetencyCode(q.tosCode) === compCode);
        if (compQs.length === 0) continue; // this quiz did not touch the goal

        const evidence =
          cumulativeByCompetency?.[comp.id] ?? {
            attempts: compQs.length,
            correct: compQs.filter((q) => submittedAnswers[q.id] === q.correctChoice).length,
          };
        const mastery = adjustedMasteryPercent(evidence.correct, evidence.attempts);
        if (
          evidence.attempts >= COMPETENCY_MASTERY_MIN_ITEMS &&
          mastery !== null &&
          mastery >= COMPETENCY_MASTERY_THRESHOLD_PERCENT
        ) {
          clearedHere.push(comp.id);
          clearedCompetencyIdSet.add(comp.id);
        }
      }

      if (clearedHere.length > 0) {
        clearedSections.push({
          id: sec.id,
          sectionLetter: sec.sectionLetter,
          title: sec.title,
          competencyIds: clearedHere,
        });
      }
    }
  }

  const clearedCompetencyIds = Array.from(clearedCompetencyIdSet);

  return {
    totalItems,
    answeredCount,
    correctCount,
    accuracyPercent,
    isAllAnswered,
    targetSection,
    clearedSections,
    clearedCompetencyIds,
  };
}

/**
 * Mastery percentages per section and per subsection (competency), from the latest answer to each question.
 * - A goal's mastery is confidence-adjusted: 1/1 correct is a weak signal (60%), not 100%.
 * - A section's mastery is the TOS-weighted average of its goals, and goals with no answers count as 0, so
 *   practicing one goal of several cannot make the whole section look mastered.
 * - Answers the AI could not tie to a specific goal still count toward a (coverage-scaled) section floor.
 */
export function computeMasteryStats(
  attemptLogs: QuestionAttemptLog[],
  subjectId: SubjectId,
  sections: {
    id: string;
    sectionLetter: string;
    competencies: { id: string; code?: string; itemCount?: number }[];
  }[]
): {
  bySection: Record<string, SectionMasteryStat>;
  byCompetency: Record<string, MasteryStat>;
} {
  const latestByQuestion = new Map<string, QuestionAttemptLog>();
  for (const log of attemptLogs) {
    if (log.subjectId !== subjectId) continue;
    const prev = latestByQuestion.get(log.questionId);
    if (!prev || log.timestamp >= prev.timestamp) latestByQuestion.set(log.questionId, log);
  }
  const logs = Array.from(latestByQuestion.values());

  const toStat = (attempts: number, correct: number): MasteryStat => ({
    attempts,
    correct,
    accuracyPercent: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
    masteryPercent: adjustedMasteryPercent(correct, attempts),
    hasEnoughData: attempts >= COMPETENCY_MIN_ANSWERS_FOR_TIER,
  });

  const bySection: Record<string, SectionMasteryStat> = {};
  const byCompetency: Record<string, MasteryStat> = {};

  for (const sec of sections) {
    const secLetter = sec.sectionLetter.trim().toUpperCase();
    const secLogs = logs.filter((l) => normalizeSectionLetter(l.sectionCode, '') === secLetter);
    let practicedGoals = 0;
    let weightedMastery = 0;
    let totalWeight = 0;

    for (const comp of sec.competencies) {
      const compCode = extractCompetencyCode(comp.code);
      const compLogs = compCode
        ? secLogs.filter((l) => extractCompetencyCode(l.tosCode) === compCode)
        : [];
      const stat = toStat(compLogs.length, compLogs.filter((l) => l.isCorrect).length);
      byCompetency[comp.id] = stat;
      if (stat.attempts > 0) practicedGoals++;

      const weight = Math.max(1, comp.itemCount ?? 1);
      totalWeight += weight;
      weightedMastery += weight * (stat.masteryPercent ?? 0);
    }

    const secCorrect = secLogs.filter((l) => l.isCorrect).length;
    const base = toStat(secLogs.length, secCorrect);
    let sectionMastery: number | null = null;
    if (secLogs.length > 0) {
      const fromGoals = totalWeight > 0 ? weightedMastery / totalWeight : 0;
      const coverage = totalWeight > 0 ? Math.min(1, secLogs.length / totalWeight) : 1;
      const floor = (adjustedMasteryPercent(secCorrect, secLogs.length) ?? 0) * coverage;
      sectionMastery = Math.round(Math.max(fromGoals, floor));
    }

    bySection[sec.id] = {
      ...base,
      masteryPercent: sectionMastery,
      practicedGoals,
      totalGoals: sec.competencies.length,
    };
  }

  return { bySection, byCompetency };
}

export interface ResumableSessionInfo {
  id: string;
  subjectId: SubjectId;
  subjectTitle: string;
  shortTitle: string;
  mode: 'practice' | 'mock';
  scopeKey: string;
  completedCount: number;
  draftOrFlaggedCount: number;
  totalItems: number;
  nextItemNumber: number;
  examSecondsLeft?: number;
  updatedAt: number;
  summaryText: string;
}

export interface SubjectResumeMeta {
  id: SubjectId;
  shortTitle: string;
  fullTitle: string;
  totalBoardItems: number;
  examDurationMinutes: number;
  sections: {
    id: string;
    sectionLetter: string;
  }[];
}

/**
 * Finds all active, unfinished Practice Quiz and Mock Exam sessions across subjects,
 * ordered with the most recently touched session first.
 */
export function findResumableSessions(
  sessionsBySubject: Partial<Record<SubjectId, SubjectSessionProgress>> | undefined,
  questionsBySubject: Record<SubjectId, QuestionScopeStub[]>,
  subjectsMeta: Record<SubjectId, SubjectResumeMeta>
): ResumableSessionInfo[] {
  if (!sessionsBySubject) return [];

  const subjectIds: SubjectId[] = [
    'dev_psych',
    'psych_assessment',
    'abnormal_psych',
    'io_psych',
  ];

  const results: ResumableSessionInfo[] = [];

  for (const subjId of subjectIds) {
    const sess = sessionsBySubject[subjId];
    const meta = subjectsMeta[subjId];
    if (!sess || !meta) continue;

    const allQs = questionsBySubject[subjId] || [];

    // 1. Check Practice Quiz session (skip if already explicitly saved/completed)
    if (allQs.length > 0 && sess.practice && !sess.practice.completedAt) {
      const scopeQs = filterQuestionsStrictByScope(
        allQs,
        sess.practice.selectedScope || 'ALL',
        meta.sections,
        sess.practice.activeQuestionIds
      );
      const totalItems = scopeQs.length;
      let submittedCount = 0;
      let unsubmittedDraftCount = 0;
      let firstUnsubmittedIdx = -1;

      scopeQs.forEach((q, idx) => {
        const isSub = Boolean(sess.practice.submittedAnswers?.[q.id]);
        if (isSub) {
          submittedCount++;
        } else {
          if (firstUnsubmittedIdx === -1) firstUnsubmittedIdx = idx;
          if (sess.practice.draftChoices?.[q.id]) {
            unsubmittedDraftCount++;
          }
        }
      });

      const hasStarted = submittedCount > 0 || unsubmittedDraftCount > 0;
      const isFinished = totalItems > 0 && submittedCount >= totalItems;

      if (hasStarted && !isFinished) {
        const nextItemNumber = firstUnsubmittedIdx >= 0 ? firstUnsubmittedIdx + 1 : 1;
        const progressLabel =
          submittedCount > 0
            ? `${submittedCount}/${totalItems} answered`
            : `${unsubmittedDraftCount} selected (unsubmitted)`;

        results.push({
          id: `${subjId}_practice`,
          subjectId: subjId,
          subjectTitle: meta.fullTitle,
          shortTitle: meta.shortTitle,
          mode: 'practice',
          scopeKey: sess.practice.selectedScope || 'ALL',
          completedCount: submittedCount,
          draftOrFlaggedCount: unsubmittedDraftCount,
          totalItems,
          nextItemNumber,
          updatedAt: sess.practice.updatedAt || 1,
          summaryText: `${progressLabel} · Item #${nextItemNumber}`,
        });
      }
    }

    // 2. Check Mock Exam session
    if (sess.mock && !sess.mock.mockSubmitted) {
      const scopeQs = filterQuestionsStrictByScope(
        allQs,
        sess.mock.selectedScope || 'ALL',
        meta.sections,
        sess.mock.activeQuestionIds
      );
      const subjectMockSize =
        meta.totalBoardItems || getSubjectMockExamSize(subjId);
      const totalItems = scopeQs.length > 0 ? scopeQs.length : subjectMockSize;
      const fullSeconds = MOCK_EXAM_DURATION_MINUTES * 60;

      let shadedCount = 0;
      let firstUnshadedIdx = -1;

      for (let i = 1; i <= totalItems; i++) {
        const mark = sess.mock.shadedMap?.[i];
        if (mark && mark !== 'BLANK') {
          shadedCount++;
        } else if (firstUnshadedIdx === -1) {
          firstUnshadedIdx = i - 1;
        }
      }

      const flaggedCount = Object.values(sess.mock.flaggedItems || {}).filter(Boolean).length;
      const timerStarted =
        typeof sess.mock.examSecondsLeft === 'number' &&
        sess.mock.examSecondsLeft > 0 &&
        sess.mock.examSecondsLeft < fullSeconds;

      if (shadedCount > 0 || flaggedCount > 0 || timerStarted) {
        const nextItemNumber = firstUnshadedIdx >= 0 ? firstUnshadedIdx + 1 : 1;
        const timeText = formatExamTimer(sess.mock.examSecondsLeft ?? fullSeconds);

        results.push({
          id: `${subjId}_mock`,
          subjectId: subjId,
          subjectTitle: meta.fullTitle,
          shortTitle: meta.shortTitle,
          mode: 'mock',
          scopeKey: sess.mock.selectedScope || 'ALL',
          completedCount: shadedCount,
          draftOrFlaggedCount: flaggedCount,
          totalItems,
          nextItemNumber,
          examSecondsLeft: sess.mock.examSecondsLeft ?? fullSeconds,
          updatedAt: sess.mock.updatedAt || 1,
          summaryText: `${shadedCount}/${totalItems} shaded · ${timeText} left`,
        });
      }
    }
  }

  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface SectionIsolationInputSection {
  id: string;
  sectionLetter: string;
  title: string;
  competencies: {
    id: string;
    code: string;
    description: string;
    bloomsBreakdown?: string;
  }[];
}

export interface StrictSectionIsolationSpec {
  isLockedSection: boolean;
  lockedSectionId?: string;
  lockedSectionLetter?: string;
  lockedSectionTitle?: string;
  allowedCompetencyCodes: string[];
  allowedCompetenciesText: string;
  excludedSiblingSectionsText: string;
  domainBoundaryNote: string;
}

const SECTION_BOUNDARY_CLARIFIERS: Record<string, string> = {
  dev_psych_A:
    'GRADUAL LEARNING RULE FOR DEV PSYCH SECTION A (Perspectives on Nature and Nurture): Keep 100% of stems AND all 4 options strictly within foundational Nature vs. Nurture concepts — heredity (genes, chromosomes, DNA, alleles, genotype vs. phenotype, dominant/recessive/sex-linked/polygenic inheritance, twin & adoption concordance, heritability, biological maturation), environment (shared vs. nonshared family/experiential influences, upbringing, learning/socioeconomic context), and heredity-environment interplay (canalization, reaction range / range of reaction, passive/evocative/active [niche-picking] genotype-environment correlations, gene × environment interaction, epigenetics). DO NOT include prenatal stages (germinal, embryonic, fetal), teratogens, stage-specific developmental issues/tasks across childhood/adolescence/adulthood, Havighurst tasks, or death/bereavement (all of those belong to Section E!). DO NOT include stage milestones (Section F), named grand stage/ecological theories such as Freud, Erikson, Piaget, Kohlberg, Bronfenbrenner, Vygotsky, Ainsworth/Mahler, or Marcia (Section C), Baltes life-span principles or cephalocaudal/proximodistal laws (Section D), or cross-sectional/longitudinal/sequential research designs and research ethics (Section B).',
  dev_psych_B:
    'GRADUAL LEARNING RULE FOR DEV PSYCH SECTION B: Keep 100% of items strictly within developmental research designs (cross-sectional, longitudinal, sequential, microgenetic, experimental, correlational, naturalistic/structured observation, case study, ethnography) and developmental research ethics (informed consent, child assent, protection from harm, confidentiality, debriefing, beneficence). Do NOT test grand developmental theories (Section C), Baltes/growth principles (Section D), or prenatal/stage developmental tasks and milestones (Sections E & F).',
  dev_psych_C:
    'GRADUAL LEARNING RULE FOR DEV PSYCH SECTION C: Keep 100% of items strictly within the named Developmental Theories in Section C (Freud psychosexual, Erikson psychosocial, Piaget cognitive, Kohlberg moral, Bronfenbrenner bioecological, Vygotsky sociocultural, Ainsworth & Mahler attachment/separation-individuation, Marcia identity statuses, Behaviorism & Social Learning, Wilson evolutionary theory). Do NOT test research designs/ethics (Section B), Baltes/cephalocaudal principles (Section D), or prenatal teratogen windows and death/bereavement tasks (Sections E & F).',
  dev_psych_D:
    'GRADUAL LEARNING RULE FOR DEV PSYCH SECTION D: Keep 100% of items strictly within general Developmental Principles (Paul Baltes life-span principles: lifelong, multidimensional, multidirectional, plastic, multicontextual, multidisciplinary; directional principles such as cephalocaudal, proximodistal, orthogenetic/hierarchical integration; normative age-graded, history-graded, and nonnormative life events; critical vs. sensitive periods in principle). Do NOT drift into named stage theories (Section C) or specific stage tasks/milestones/bereavement (Sections E & F).',
  dev_psych_E:
    'GRADUAL LEARNING RULE FOR DEV PSYCH SECTION E: Keep 100% of items strictly within Developmental Issues and Expected Developmental Tasks across prenatal development (including prenatal heredity/environmental teratogen issues), childhood, adolescence, adulthood, and death/bereavement as listed in Section E. Do NOT test research methodology (Section B) or abstract twin heritability formulas (Section A).',
  dev_psych_F:
    'GRADUAL LEARNING RULE FOR DEV PSYCH SECTION F: Keep 100% of items strictly within Developmental Challenges, normative physical/cognitive/socio-emotional Milestones across prenatal, childhood, adolescence, and adulthood stages, coping with bereavement, and decisions about death as listed in Section F.',
  psych_assessment_A:
    'GRADUAL LEARNING RULE FOR PSYCH ASSESSMENT SECTION A: Keep 100% of items strictly within Psychometric Properties and Principles (classical test theory, true score & SEM, reliability types, validity types, MTMM, item difficulty & item discrimination principles for accepting, rejecting, and interpreting instruments). Do NOT introduce PAP Code of Ethics / RA 10029 legal-ethical dilemmas (reserved for Section F), live rapport/administration anomalies (Section E), or clinical battery tool selection (Sections C & D).',
  psych_assessment_B:
    'GRADUAL LEARNING RULE FOR PSYCH ASSESSMENT SECTION B: Keep 100% of items strictly within Research Methods, Statistics, Norms, and Standardization procedures in test construction and test studies (scales of measurement, z/T/stanine/sten/percentile norms, correlation/regression/factor analysis in test development). Do NOT introduce PAP Code of Ethics violations (Section F) or clinical test administration errors (Section E).',
  abnormal_psych_A:
    'GRADUAL LEARNING RULE FOR ABNORMAL PSYCH SECTION A: Keep 100% of items strictly within Manifestations of Behavior — distinguishing normal vs. abnormal behavior (the 4 Ds: deviance, distress, dysfunction, danger), cultural and social context of abnormality, cultural concepts of distress, and adaptive vs. maladaptive behavior. Do NOT jump ahead to specific DSM-5 disorder duration/symptom differential diagnosis (Section B), neurotransmitter/genetic etiology models (Section C), psychotherapy techniques (Section D), diagnostic ethics (Section E), or COVID-19 / RA 11036 Mental Health Act provisions (Section F).',
  io_psych_A:
    'GRADUAL LEARNING RULE FOR I/O PSYCH SECTION A: Keep 100% of items strictly within Organization Theory (Classical, Neo-Classical/Human Relations, Modern, Contingency, Motivation, and Open Systems theories and how organization theory informs leadership, culture, and efficiency). Do NOT jump ahead to specific structural types like Matrix/Flat/Network pros & cons or span of control (Section B), HRM vs. HRD recruitment/training/appraisal processes (Section C), Tuckman team development stages & groupthink (Section D), or Lewin change models & OD interventions (Section E).',
};

/**
 * Builds an explicit single-section isolation specification for gradual learning,
 * enumerating both the target section's allowed competencies and all excluded sibling sections
 * so the LLM never bleeds "kinda related" topics from later or adjacent sections.
 */
export function buildStrictSectionIsolationSpec(
  subjectId: SubjectId,
  sections: SectionIsolationInputSection[],
  scopeKey: string
): StrictSectionIsolationSpec {
  if (!scopeKey || scopeKey === 'ALL') {
    return {
      isLockedSection: false,
      allowedCompetencyCodes: [],
      allowedCompetenciesText: '',
      excludedSiblingSectionsText: '',
      domainBoundaryNote: '',
    };
  }

  let targetSec = sections.find((s) => s.id === scopeKey) || null;
  let singleCompetencyId: string | null = null;

  if (!targetSec) {
    for (const sec of sections) {
      const comp = sec.competencies.find((c) => c.id === scopeKey);
      if (comp) {
        targetSec = sec;
        singleCompetencyId = comp.id;
        break;
      }
    }
  }

  if (!targetSec) {
    return {
      isLockedSection: false,
      allowedCompetencyCodes: [],
      allowedCompetenciesText: '',
      excludedSiblingSectionsText: '',
      domainBoundaryNote: '',
    };
  }

  const targetLetter = targetSec.sectionLetter.trim().toUpperCase();
  const activeComps = singleCompetencyId
    ? targetSec.competencies.filter((c) => c.id === singleCompetencyId)
    : targetSec.competencies;

  const allowedCompetencyCodes = activeComps.map((c) => c.code);
  const allowedCompetenciesText = activeComps
    .map(
      (c) =>
        `[${c.code}] ${c.description}${c.bloomsBreakdown ? ` (${c.bloomsBreakdown})` : ''}`
    )
    .join('\n');

  const siblingSections = sections.filter(
    (s) => s.sectionLetter.trim().toUpperCase() !== targetLetter
  );

  const excludedSiblingSectionsText = siblingSections
    .map((sec) => {
      const compSummary = sec.competencies
        .map((c) => `${c.code}: ${c.description}`)
        .join('; ');
      return `- Section ${sec.sectionLetter} (${sec.title}) [OFF-LIMITS]: ${compSummary}`;
    })
    .join('\n');

  const clarifierKey = `${subjectId}_${targetLetter}`;
  const domainBoundaryNote =
    SECTION_BOUNDARY_CLARIFIERS[clarifierKey] ||
    `GRADUAL LEARNING RULE FOR SECTION ${targetLetter} (${targetSec.title}): Every question stem, keyed answer, and distractor choice (A, B, C, D) MUST stay 100% within Section ${targetLetter}'s listed competencies and MUST NOT borrow theories, stages, diagnostic rules, research methods, or ethical mandates from Sections ${siblingSections
      .map((s) => s.sectionLetter)
      .join(', ')}.`;

  return {
    isLockedSection: true,
    lockedSectionId: targetSec.id,
    lockedSectionLetter: targetLetter,
    lockedSectionTitle: targetSec.title,
    allowedCompetencyCodes,
    allowedCompetenciesText,
    excludedSiblingSectionsText,
    domainBoundaryNote,
  };
}

export interface LockedSectionQuestionCandidate {
  stem: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctChoice: 'A' | 'B' | 'C' | 'D';
  sectionCode?: string;
  tosCode?: string;
}

const DEV_PSYCH_SEC_A_REQUIRED_ANCHOR =
  /\b(heredit\w*|natur\w*|nurtur\w*|environment\w*|genet\w*|gene|genes|genotyp\w*|phenotyp\w*|chromosom\w*|dna|allele\w*|dominant|recessive|polygenic|multifactorial|twin\w*|monozygotic|dizygotic|fraternal|identical|adopt\w*|concordance|heritabilit\w*|maturation\w*|canaliz\w*|reaction\s+range|range\s+of\s+reaction|niche[\s-]picking|evocative|passive|epigenet\w*|inborn|innate|biological\s+predisposition|upbringing|reared|shared\s+environment|non[\s-]?shared)\b/i;

const FORBIDDEN_SIBLING_PATTERNS_BY_SECTION: Record<string, RegExp[]> = {
  dev_psych_A: [
    // Section E & F: Prenatal stages/teratogens, stage developmental tasks, adulthood/aging crises, death & bereavement
    /\b(germinal\s+(?:stage|period)|embryonic\s+(?:stage|period)|fetal\s+(?:stage|period)|prenatal\s+(?:stage|period|diagnostic|care)|organogenesis|teratogen\w*|fetal\s+alcohol|thalidomide|maternal\s+rubella|havighurst|developmental\s+task\w*|empty\s+nest|sandwich\s+generation|midlife\s+crisis|retirement\s+adjustment|kubler[\s-]*ross|kübler[\s-]*ross|bereavement|grief\s+work|palliative\s+care|euthanasia)\b/i,
    // Section C: Named grand developmental stage/ecological theories
    /\b(erikson\w*|trust\s+vs\.?\s+mistrust|autonomy\s+vs\.?\s+shame|initiative\s+vs\.?\s+guilt|industry\s+vs\.?\s+inferiority|identity\s+vs\.?\s+role\s+confusion|intimacy\s+vs\.?\s+isolation|generativity\s+vs\.?\s+stagnation|integrity\s+vs\.?\s+despair|piaget\w*|sensorimotor|preoperational|concrete\s+operational|formal\s+operational|object\s+permanence|centration|kohlberg\w*|preconventional|postconventional|psychosexual\s+stage\w*|oedipus\s+complex|electra\s+complex|bronfenbrenner\w*|microsystem|mesosystem|exosystem|macrosystem|chronosystem|vygotsky\w*|zone\s+of\s+proximal\s+development|scaffolding|james\s+marcia|identity\s+foreclosure|identity\s+moratorium|identity\s+diffusion|identity\s+achievement|strange\s+situation|margaret\s+mahler|separation[\s-]individuation|rapprochement)\b/i,
    // Section B: Research methods & research ethics
    /\b(cross[\s-]sectional\s+(?:design|study|method|research)|longitudinal\s+(?:design|study|method|research)|sequential\s+(?:design|study)|cross[\s-]sequential|microgenetic\s+design|cohort\s+effect\w*|informed\s+consent|institutional\s+review\s+board)\b/i,
    // Section D: Directional laws & Baltes life-span principles
    /\b(cephalocaudal|proximodistal|paul\s+baltes|multidirectionality|multidimensionality)\b/i,
  ],
  dev_psych_B: [
    /\b(germinal\s+stage|embryonic\s+stage|teratogen\w*|kubler[\s-]*ross|kübler[\s-]*ross|identity\s+foreclosure|identity\s+moratorium|zone\s+of\s+proximal\s+development|separation[\s-]individuation|cephalocaudal|proximodistal)\b/i,
  ],
  psych_assessment_A: [
    // Section F: Ethics & legal mandates
    /\b(pap\s+code\s+of\s+ethics|ra\s*10029|informed\s+consent|release\s+of\s+test\s+data|subpoena)\b/i,
  ],
  abnormal_psych_A: [
    // Section D & F: Specific psychotherapy techniques & RA 11036 / COVID-19 law
    /\b(ra\s*11036|mental\s+health\s+act|systematic\s+desensitization|dialectical\s+behavior\s+therapy|electroconvulsive\s+therapy)\b/i,
  ],
  io_psych_A: [
    // Section D & E: Tuckman team stages & Lewin change steps
    /\b(tuckman|forming,\s*storming|social\s+loafing|groupthink|unfreezing|refreezing)\b/i,
  ],
};

/**
 * Deterministically checks whether a generated question stays strictly inside the locked section
 * without bleeding concepts from sibling sections (such as Section E developmental tasks/prenatal
 * teratogens leaking into a Developmental Psychology Section A Nature & Nurture quiz).
 */
export function isQuestionPureForLockedSection(
  item: LockedSectionQuestionCandidate,
  subjectId: SubjectId,
  lockedSectionLetter: string
): boolean {
  const target = (lockedSectionLetter || '').trim().toUpperCase();
  if (!target) return true;

  // 1. If the model explicitly tagged a different valid section letter (A-F), reject immediately
  if (item.sectionCode && item.sectionCode.trim()) {
    const normalizedModelSec = normalizeSectionLetter(item.sectionCode, '');
    if (normalizedModelSec && normalizedModelSec !== target) {
      return false;
    }
  }

  // 2. If tosCode explicitly names a different Section letter (e.g. "Section E · 1.1"), reject
  if (item.tosCode && item.tosCode.trim()) {
    const tosSecMatch = item.tosCode.match(/\b(?:section|sec)\.?\s*([A-Fa-f])\b/i);
    if (tosSecMatch && tosSecMatch[1].toUpperCase() !== target) {
      return false;
    }
  }

  const combinedSurface = [
    item.stem || '',
    item.options?.A || '',
    item.options?.B || '',
    item.options?.C || '',
    item.options?.D || '',
  ].join(' ');

  // 3. Check forbidden sibling-section construct patterns
  const key = `${subjectId}_${target}`;
  const forbiddenPatterns = FORBIDDEN_SIBLING_PATTERNS_BY_SECTION[key];
  if (forbiddenPatterns && forbiddenPatterns.some((rx) => rx.test(combinedSurface))) {
    return false;
  }

  // 4. For Dev Psych Section A (Nature & Nurture), require at least one genuine heredity/environment anchor
  //    so generic stage-task or aging/adolescence vignettes without Nature/Nurture mechanics cannot slip through
  if (key === 'dev_psych_A' && !DEV_PSYCH_SEC_A_REQUIRED_ANCHOR.test(combinedSurface)) {
    return false;
  }

  return true;
}

/**
 * Filters a batch of candidate questions so only items strictly pure to the locked section survive.
 */
export function filterPureLockedSectionQuestions<T extends LockedSectionQuestionCandidate>(
  items: T[],
  subjectId: SubjectId,
  lockedSectionLetter?: string
): T[] {
  if (!lockedSectionLetter || !lockedSectionLetter.trim()) {
    return items;
  }
  return items.filter((item) =>
    isQuestionPureForLockedSection(item, subjectId, lockedSectionLetter)
  );
}

export interface SubjectCircularRingItem {
  subjectId: SubjectId;
  subjectTitle: string;
  attempts: number;
  correct: number;
  accuracyPercent: number;
  hasPerformanceData: boolean;
  masteredGoals: number;
  totalGoals: number;
  goalMasteryPercent: number;
  ringFillPercent: number;
  radius: number;
  circumference: number;
  strokeDashoffset: number;
  status: 'STRENGTH' | 'DEVELOPING' | 'WEAKNESS' | 'UNTESTED';
}

export interface SubjectCircularChartSummary {
  totalAttempts: number;
  totalCorrect: number;
  overallAccuracyPercent: number;
  overallGoalMasteryPercent: number;
  centerMetricValue: string;
  centerMetricLabel: string;
  rings: SubjectCircularRingItem[];
}

export interface SubjectWithCompetencyIds extends SubjectSectionMeta {
  sections: {
    id: string;
    sectionLetter: string;
    title: string;
    weightPercent: number;
    competencies: { id: string }[];
  }[];
}

/**
 * Computes pure concentric circular ring metrics for the 4 BLEPP subjects on the Home Screen.
 * Uses quiz/mock accuracy when a subject has recorded attempts or a GWA rating, and falls back
 * to syllabus goal mastery percentage when untested.
 */
export function buildSubjectCircularChartData(
  attemptLogs: QuestionAttemptLog[],
  subjectsMeta: Record<SubjectId, SubjectWithCompetencyIds>,
  grades: SubjectGrades,
  masteredCompetencies: Record<string, boolean>
): SubjectCircularChartSummary {
  const report = analyzeStrengthsAndWeaknesses(attemptLogs, subjectsMeta, grades);
  const radii: Record<SubjectId, number> = {
    dev_psych: 92,
    psych_assessment: 76,
    abnormal_psych: 60,
    io_psych: 44,
  };

  let allTotalGoals = 0;
  let allMasteredGoals = 0;

  const rings: SubjectCircularRingItem[] = report.subjectStats.map((stat) => {
    const subj = subjectsMeta[stat.subjectId];
    let totalGoals = 0;
    let masteredGoals = 0;
    for (const sec of subj.sections) {
      for (const comp of sec.competencies) {
        totalGoals++;
        allTotalGoals++;
        if (masteredCompetencies[comp.id]) {
          masteredGoals++;
          allMasteredGoals++;
        }
      }
    }

    const goalMasteryPercent =
      totalGoals > 0 ? Number(((masteredGoals / totalGoals) * 100).toFixed(1)) : 0;
    const hasPerformanceData = stat.status !== 'UNTESTED';
    const rawPercent = hasPerformanceData ? stat.accuracyPercent : goalMasteryPercent;
    const clampedPercent = Math.min(100, Math.max(0, rawPercent));
    // Keep a subtle 2% starting cap when >0 or 0 so ring geometry stays valid and crisp
    const visualPercent = clampedPercent > 0 ? Math.max(clampedPercent, 3) : 0;

    const radius = radii[stat.subjectId];
    const circumference = Number((2 * Math.PI * radius).toFixed(2));
    const strokeDashoffset = Number(
      (circumference * (1 - visualPercent / 100)).toFixed(2)
    );

    return {
      subjectId: stat.subjectId,
      subjectTitle: stat.subjectTitle,
      attempts: stat.attempts,
      correct: stat.correct,
      accuracyPercent: stat.accuracyPercent,
      hasPerformanceData,
      masteredGoals,
      totalGoals,
      goalMasteryPercent,
      ringFillPercent: clampedPercent,
      radius,
      circumference,
      strokeDashoffset,
      status: stat.status,
    };
  });

  const overallGoalMasteryPercent =
    allTotalGoals > 0
      ? Number(((allMasteredGoals / allTotalGoals) * 100).toFixed(1))
      : 0;

  const anySubjectHasPerf = rings.some((r) => r.hasPerformanceData);
  const centerMetricValue =
    report.totalAttempts > 0
      ? `${report.overallAccuracyPercent}%`
      : anySubjectHasPerf
      ? `${Number(
          (
            rings.reduce((acc, r) => acc + r.accuracyPercent, 0) / rings.length
          ).toFixed(1)
        )}%`
      : `${overallGoalMasteryPercent}%`;

  const centerMetricLabel =
    report.totalAttempts > 0 || anySubjectHasPerf ? 'Accuracy' : 'Goals Cleared';

  return {
    totalAttempts: report.totalAttempts,
    totalCorrect: report.totalCorrect,
    overallAccuracyPercent: report.overallAccuracyPercent,
    overallGoalMasteryPercent,
    centerMetricValue,
    centerMetricLabel,
    rings,
  };
}

export interface SunburstWedgeNode {
  id: string;
  level: 1 | 2 | 3;
  subjectId: SubjectId;
  sectionId?: string;
  sectionLetter?: string;
  title: string;
  shortLabel: string;
  valueLabel: string;
  startDeg: number;
  endDeg: number;
  spanDeg: number;
  rInner: number;
  rOuter: number;
  pathD: string;
  labelX: number;
  labelY: number;
  labelRotationDeg: number;
  labelOrientation: 'tangential' | 'radial';
  attempts: number;
  correct: number;
  accuracyPercent: number;
  hasPerformanceData: boolean;
  masteredGoals: number;
  totalGoals: number;
  status: 'STRENGTH' | 'DEVELOPING' | 'WEAKNESS' | 'UNTESTED';
}

export interface SubjectSunburstChartData {
  viewBoxSize: number;
  cx: number;
  cy: number;
  hubRadius: number;
  centerTitle: string;
  centerValue: string;
  totalAttempts: number;
  totalCorrect: number;
  overallAccuracyPercent: number;
  totalMasteredGoals: number;
  totalAllGoals: number;
  wedges: SunburstWedgeNode[];
  subjectLegend: {
    subjectId: SubjectId;
    subjectTitle: string;
    shortTitle: string;
    valueLabel: string;
  }[];
}

export function polarToSunburstCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDegClockwiseFromTop: number
): { x: number; y: number } {
  const rad = ((angleDegClockwiseFromTop - 90) * Math.PI) / 180;
  return {
    x: Number((cx + radius * Math.cos(rad)).toFixed(2)),
    y: Number((cy + radius * Math.sin(rad)).toFixed(2)),
  };
}

export function buildSunburstAnnularPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number
): string {
  const clampedEnd = Math.min(startDeg + 359.99, endDeg);
  const p1 = polarToSunburstCartesian(cx, cy, rOuter, startDeg);
  const p2 = polarToSunburstCartesian(cx, cy, rOuter, clampedEnd);
  const p3 = polarToSunburstCartesian(cx, cy, rInner, clampedEnd);
  const p4 = polarToSunburstCartesian(cx, cy, rInner, startDeg);
  const largeArc = clampedEnd - startDeg > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y} Z`;
}

function computeUprightWedgeLabelTransform(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
  forceTangential = false
): {
  x: number;
  y: number;
  rotationDeg: number;
  orientation: 'tangential' | 'radial';
} {
  const midDeg = (startDeg + endDeg) / 2;
  const rMid = (rInner + rOuter) / 2;
  const pos = polarToSunburstCartesian(cx, cy, rMid, midDeg);
  const spanDeg = endDeg - startDeg;
  const arcWidthPx = rMid * ((spanDeg * Math.PI) / 180);
  const radialDepthPx = rOuter - rInner;

  if (forceTangential || arcWidthPx >= radialDepthPx * 0.98) {
    let rot = midDeg % 360;
    if (rot > 180) rot -= 360;
    if (rot > 90) rot -= 180;
    if (rot < -90) rot += 180;
    return {
      x: pos.x,
      y: pos.y,
      rotationDeg: Number(rot.toFixed(2)),
      orientation: 'tangential',
    };
  }

  const radialRot = midDeg <= 180 ? midDeg - 90 : midDeg - 270;
  return {
    x: pos.x,
    y: pos.y,
    rotationDeg: Number(radialRot.toFixed(2)),
    orientation: 'radial',
  };
}

const SUNBURST_SUBJECT_SHORT_LABELS: Record<SubjectId, string> = {
  psych_assessment: 'Psych Assessment',
  dev_psych: 'Dev Psych',
  abnormal_psych: 'Abnormal Psych',
  io_psych: 'I/O Psych',
};

const SUNBURST_SECTION_SHORT_LABELS: Record<string, string> = {
  pa_A: 'Psychometrics',
  pa_B: 'Statistics',
  pa_C: 'Tools & Uses',
  pa_D: 'Selection',
  pa_E: 'Admin/Score',
  pa_F: 'Ethics',
  dev_A: 'Nature/Nurt',
  dev_B: 'Research',
  dev_C: 'Theories',
  dev_D: 'Principles',
  dev_E: 'Stage Tasks',
  dev_F: 'Milestones',
  abn_A: 'Behavior',
  abn_B: 'DSM-5',
  abn_C: 'Etiology',
  abn_D: 'Therapy',
  abn_E: 'Culture/Eth',
  abn_F: 'MH Law',
  io_A: 'Org Theory',
  io_B: 'Structure',
  io_C: 'HRD & HRM',
  io_D: 'Teams',
  io_E: 'Org Change',
};

interface SunburstSubClusterDef {
  shortLabel: string;
  fullTitle: string;
  compRange: [number, number]; // [startIdx, endIdxExclusive]
}

const SUNBURST_SECTION_SUBCLUSTERS: Record<string, SunburstSubClusterDef[]> = {
  pa_A: [
    { shortLabel: 'CTT & IRT', fullTitle: 'Classical & Item Response Theory', compRange: [0, 2] },
    { shortLabel: 'Reliability', fullTitle: 'Reliability & Measurement Error', compRange: [2, 4] },
    { shortLabel: 'Validity', fullTitle: 'Validity & Item Analysis', compRange: [4, 6] },
  ],
  pa_B: [
    { shortLabel: 'Design', fullTitle: 'Research Design & Sampling', compRange: [0, 2] },
    { shortLabel: 'Norms/Stats', fullTitle: 'Norms, Scales & Correlation', compRange: [2, 5] },
  ],
  pa_D: [
    { shortLabel: 'Criteria', fullTitle: 'Test Selection Criteria', compRange: [0, 3] },
    { shortLabel: 'Clinical/IO', fullTitle: 'Clinical, Ed & I/O Batteries', compRange: [3, 6] },
  ],
  pa_E: [
    { shortLabel: 'Scoring', fullTitle: 'Administration & Scoring', compRange: [0, 3] },
    { shortLabel: 'Reporting', fullTitle: 'Interpretation & Psych Reports', compRange: [3, 5] },
  ],
  pa_F: [
    { shortLabel: 'PAP Code', fullTitle: 'PAP Ethical Standards', compRange: [0, 3] },
    { shortLabel: 'RA 10029', fullTitle: 'Philippine Psychology Act', compRange: [3, 5] },
  ],
  dev_C: [
    { shortLabel: 'Theorists', fullTitle: 'Core Developmental Theories', compRange: [0, 10] },
  ],
  dev_E: [
    { shortLabel: 'Lifespan', fullTitle: 'Lifespan Stage Tasks', compRange: [0, 7] },
  ],
  dev_F: [
    { shortLabel: 'Challenges', fullTitle: 'Developmental Milestones', compRange: [0, 7] },
  ],
  abn_B: [
    { shortLabel: 'Mood/Anx', fullTitle: 'Neurodevelopmental, Mood & Anxiety', compRange: [0, 7] },
    { shortLabel: 'Trauma/Pers', fullTitle: 'Trauma, Somatic & Personality', compRange: [7, 14] },
  ],
  abn_C: [
    { shortLabel: 'Models', fullTitle: 'Etiological Perspectives', compRange: [0, 7] },
  ],
  io_B: [
    { shortLabel: 'Systems', fullTitle: 'Organizational Systems', compRange: [0, 6] },
  ],
  io_C: [
    { shortLabel: 'Selection', fullTitle: 'Job Analysis & Recruitment', compRange: [0, 3] },
    { shortLabel: 'Training', fullTitle: 'Appraisal, Training & Comp', compRange: [3, 5] },
  ],
  io_E: [
    { shortLabel: 'OD Models', fullTitle: 'Organizational Development', compRange: [0, 5] },
  ],
};

/**
 * Builds a 3-ring hierarchical Sunburst diagram (Center Overall Hub -> Ring 1 Subjects ->
 * Ring 2 Syllabus Sections -> Ring 3 Stepped Sub-Topics / Tested Performance) modeled directly
 * on a stepped radial partition diagram.
 */
export function buildSubjectSunburstData(
  attemptLogs: QuestionAttemptLog[],
  subjectsMeta: Record<SubjectId, SubjectWithCompetencyIds>,
  grades: SubjectGrades,
  masteredCompetencies: Record<string, boolean>
): SubjectSunburstChartData {
  const viewBoxSize = 540;
  const cx = 270;
  const cy = 270;
  const hubRadius = 56;
  const r1Inner = 56;
  const r1Outer = 120;
  const r2Inner = 120;
  const r2Outer = 192;
  const r3Inner = 192;
  const r3Outer = 258;

  const report = analyzeStrengthsAndWeaknesses(attemptLogs, subjectsMeta, grades);

  // Deduplicate attempts keeping latest per questionId so Ring-3 drill stats match report
  const latestByQuestion = new Map<string, QuestionAttemptLog>();
  for (const log of attemptLogs) {
    const existing = latestByQuestion.get(log.questionId);
    if (!existing || log.timestamp >= existing.timestamp) {
      latestByQuestion.set(log.questionId, log);
    }
  }
  const activeLogs = Array.from(latestByQuestion.values());

  // Order clockwise starting at 12 o'clock with the 40% flagship subject first
  const orderedSubjectIds: SubjectId[] = [
    'psych_assessment',
    'dev_psych',
    'abnormal_psych',
    'io_psych',
  ];

  const totalBoardWeight = orderedSubjectIds.reduce(
    (sum, id) => sum + subjectsMeta[id].weightPercent,
    0
  );

  let totalAllGoals = 0;
  let totalMasteredGoals = 0;
  for (const subjId of orderedSubjectIds) {
    for (const sec of subjectsMeta[subjId].sections) {
      for (const comp of sec.competencies) {
        totalAllGoals++;
        if (masteredCompetencies[comp.id]) totalMasteredGoals++;
      }
    }
  }

  const wedges: SunburstWedgeNode[] = [];
  const subjectLegend: SubjectSunburstChartData['subjectLegend'] = [];

  let cursorDeg = 0;

  for (const subjId of orderedSubjectIds) {
    const subj = subjectsMeta[subjId];
    const subjStat = report.subjectStats.find((s) => s.subjectId === subjId)!;
    const subjSpanDeg = (subj.weightPercent / totalBoardWeight) * 360;
    const subjStartDeg = cursorDeg;
    const subjEndDeg = cursorDeg + subjSpanDeg;
    cursorDeg = subjEndDeg;

    let subjGoalsTotal = 0;
    let subjGoalsMastered = 0;
    for (const sec of subj.sections) {
      for (const comp of sec.competencies) {
        subjGoalsTotal++;
        if (masteredCompetencies[comp.id]) subjGoalsMastered++;
      }
    }

    const subjHasPerf = subjStat.status !== 'UNTESTED';
    const subjValueLabel = subjHasPerf
      ? `(${Math.round(subjStat.accuracyPercent)}%)`
      : `(${subjGoalsMastered}/${subjGoalsTotal})`;

    const subjLabelTf = computeUprightWedgeLabelTransform(
      cx,
      cy,
      r1Inner,
      r1Outer,
      subjStartDeg,
      subjEndDeg,
      true
    );

    wedges.push({
      id: `subj_${subjId}`,
      level: 1,
      subjectId: subjId,
      title: subj.fullTitle,
      shortLabel: SUNBURST_SUBJECT_SHORT_LABELS[subjId],
      valueLabel: subjValueLabel,
      startDeg: Number(subjStartDeg.toFixed(3)),
      endDeg: Number(subjEndDeg.toFixed(3)),
      spanDeg: Number(subjSpanDeg.toFixed(3)),
      rInner: r1Inner,
      rOuter: r1Outer,
      pathD: buildSunburstAnnularPath(cx, cy, r1Inner, r1Outer, subjStartDeg, subjEndDeg),
      labelX: subjLabelTf.x,
      labelY: subjLabelTf.y,
      labelRotationDeg: subjLabelTf.rotationDeg,
      labelOrientation: subjLabelTf.orientation,
      attempts: subjStat.attempts,
      correct: subjStat.correct,
      accuracyPercent: subjStat.accuracyPercent,
      hasPerformanceData: subjHasPerf,
      masteredGoals: subjGoalsMastered,
      totalGoals: subjGoalsTotal,
      status: subjStat.status,
    });

    subjectLegend.push({
      subjectId: subjId,
      subjectTitle: subj.fullTitle,
      shortTitle: SUNBURST_SUBJECT_SHORT_LABELS[subjId],
      valueLabel: subjValueLabel,
    });

    // Subdivide Ring 2 across this subject's sections with a legibility floor (>= 8.5 deg)
    const effectiveWeights = subj.sections.map((s) => 12 + s.weightPercent * 0.45);
    const effectiveSum = effectiveWeights.reduce((a, b) => a + b, 0);
    let secCursorDeg = subjStartDeg;

    subj.sections.forEach((sec, idx) => {
      const secSpanDeg = (effectiveWeights[idx] / effectiveSum) * subjSpanDeg;
      const secStartDeg = secCursorDeg;
      const secEndDeg =
        idx === subj.sections.length - 1 ? subjEndDeg : secCursorDeg + secSpanDeg;
      secCursorDeg = secEndDeg;

      const topicStat = report.allTopicStats.find(
        (t) => t.subjectId === subjId && t.sectionId === sec.id
      );
      const secAttempts = topicStat ? topicStat.attempts : 0;
      const secCorrect = topicStat ? topicStat.correct : 0;
      const secAcc = topicStat ? topicStat.accuracyPercent : 0;
      const secStatus = topicStat ? topicStat.status : 'UNTESTED';

      const secTotalGoals = sec.competencies.length;
      const secMasteredGoals = sec.competencies.filter(
        (c) => masteredCompetencies[c.id]
      ).length;

      const secHasPerf = secAttempts > 0;
      const secValueLabel = secHasPerf
        ? `(${Math.round(secAcc)}%)`
        : `(${secMasteredGoals}/${secTotalGoals})`;

      const secLabelTf = computeUprightWedgeLabelTransform(
        cx,
        cy,
        r2Inner,
        r2Outer,
        secStartDeg,
        secEndDeg,
        false
      );

      wedges.push({
        id: `sec_${sec.id}`,
        level: 2,
        subjectId: subjId,
        sectionId: sec.id,
        sectionLetter: sec.sectionLetter,
        title: `Section ${sec.sectionLetter}: ${sec.title}`,
        shortLabel: SUNBURST_SECTION_SHORT_LABELS[sec.id] || `Sec ${sec.sectionLetter}`,
        valueLabel: secValueLabel,
        startDeg: Number(secStartDeg.toFixed(3)),
        endDeg: Number(secEndDeg.toFixed(3)),
        spanDeg: Number((secEndDeg - secStartDeg).toFixed(3)),
        rInner: r2Inner,
        rOuter: r2Outer,
        pathD: buildSunburstAnnularPath(cx, cy, r2Inner, r2Outer, secStartDeg, secEndDeg),
        labelX: secLabelTf.x,
        labelY: secLabelTf.y,
        labelRotationDeg: secLabelTf.rotationDeg,
        labelOrientation: secLabelTf.orientation,
        attempts: secAttempts,
        correct: secCorrect,
        accuracyPercent: secAcc,
        hasPerformanceData: secHasPerf,
        masteredGoals: secMasteredGoals,
        totalGoals: secTotalGoals,
        status: secStatus,
      });

      // Ring 3 Stepped Sunburst Crown:
      // 1) If this section has quiz/mock attempts, show tested tier breakdown (if wide) or active score/goal crown
      // 2) Else if this section has curated multi-competency subclusters, show those subclusters
      // 3) Compact unquizzed sections stop cleanly at Ring 2, forming the stepped sunburst profile
      const secLogs = activeLogs.filter(
        (l) =>
          l.subjectId === subjId &&
          normalizeSectionLetter(l.sectionCode, '') === sec.sectionLetter.toUpperCase()
      );

      const actualSecSpan = secEndDeg - secStartDeg;
      const maxReadableChildSlots = Math.max(1, Math.floor(actualSecSpan / 8.2));

      if (secLogs.length > 0) {
        const tierOrder: DifficultyTier[] = ['Easy', 'Moderate', 'Difficult'];
        const populatedTiers = tierOrder
          .map((tier) => {
            const matching = secLogs.filter(
              (l) => getDifficultyFromBlooms(l.bloomsLevel) === tier
            );
            const c = matching.filter((l) => l.isCorrect).length;
            const acc =
              matching.length > 0 ? Number(((c / matching.length) * 100).toFixed(1)) : 0;
            return { tier, count: matching.length, correct: c, acc };
          })
          .filter((t) => t.count > 0);

        if (populatedTiers.length >= 2 && maxReadableChildSlots >= populatedTiers.length) {
          let tierCursor = secStartDeg;
          const totalTierLogs = populatedTiers.reduce((s, t) => s + t.count, 0);
          const adjWeights = populatedTiers.map((t) => Math.max(t.count, totalTierLogs * 0.28));
          const adjSum = adjWeights.reduce((a, b) => a + b, 0);

          populatedTiers.forEach((t, tIdx) => {
            const cSpan = (adjWeights[tIdx] / adjSum) * actualSecSpan;
            const cStart = tierCursor;
            const cEnd = tIdx === populatedTiers.length - 1 ? secEndDeg : tierCursor + cSpan;
            tierCursor = cEnd;

            const tf = computeUprightWedgeLabelTransform(
              cx,
              cy,
              r3Inner,
              r3Outer,
              cStart,
              cEnd,
              false
            );
            const tierShort =
              t.tier === 'Moderate' ? 'Moderate' : t.tier === 'Difficult' ? 'Difficult' : 'Easy';
            const tierStatus: SunburstWedgeNode['status'] =
              t.acc >= 75 ? 'STRENGTH' : t.acc >= 60 ? 'DEVELOPING' : 'WEAKNESS';

            wedges.push({
              id: `tier_${sec.id}_${t.tier}`,
              level: 3,
              subjectId: subjId,
              sectionId: sec.id,
              sectionLetter: sec.sectionLetter,
              title: `Section ${sec.sectionLetter} · ${t.tier} Items`,
              shortLabel: tierShort,
              valueLabel: `(${Math.round(t.acc)}%)`,
              startDeg: Number(cStart.toFixed(3)),
              endDeg: Number(cEnd.toFixed(3)),
              spanDeg: Number((cEnd - cStart).toFixed(3)),
              rInner: r3Inner,
              rOuter: r3Outer,
              pathD: buildSunburstAnnularPath(cx, cy, r3Inner, r3Outer, cStart, cEnd),
              labelX: tf.x,
              labelY: tf.y,
              labelRotationDeg: tf.rotationDeg,
              labelOrientation: tf.orientation,
              attempts: t.count,
              correct: t.correct,
              accuracyPercent: t.acc,
              hasPerformanceData: true,
              masteredGoals: secMasteredGoals,
              totalGoals: secTotalGoals,
              status: tierStatus,
            });
          });
        } else {
          // Single crisp outer Ring-3 crown wedge for narrow tested sections (e.g. Dev Psych Sec A)
          const tf = computeUprightWedgeLabelTransform(
            cx,
            cy,
            r3Inner,
            r3Outer,
            secStartDeg,
            secEndDeg,
            false
          );
          wedges.push({
            id: `tested_${sec.id}`,
            level: 3,
            subjectId: subjId,
            sectionId: sec.id,
            sectionLetter: sec.sectionLetter,
            title: `Section ${sec.sectionLetter} · Answered Items & Goals`,
            shortLabel: secMasteredGoals === secTotalGoals ? 'Cleared' : 'Answered',
            valueLabel: `(${secCorrect}/${secAttempts})`,
            startDeg: Number(secStartDeg.toFixed(3)),
            endDeg: Number(secEndDeg.toFixed(3)),
            spanDeg: Number(actualSecSpan.toFixed(3)),
            rInner: r3Inner,
            rOuter: r3Outer,
            pathD: buildSunburstAnnularPath(
              cx,
              cy,
              r3Inner,
              r3Outer,
              secStartDeg,
              secEndDeg
            ),
            labelX: tf.x,
            labelY: tf.y,
            labelRotationDeg: tf.rotationDeg,
            labelOrientation: tf.orientation,
            attempts: secAttempts,
            correct: secCorrect,
            accuracyPercent: secAcc,
            hasPerformanceData: true,
            masteredGoals: secMasteredGoals,
            totalGoals: secTotalGoals,
            status: secStatus,
          });
        }
      } else {
        const subClusters = SUNBURST_SECTION_SUBCLUSTERS[sec.id];
        if (subClusters && subClusters.length > 0 && maxReadableChildSlots >= subClusters.length) {
          let clusterCursor = secStartDeg;
          const clusterSpan = actualSecSpan / subClusters.length;

          subClusters.forEach((cluster, cIdx) => {
            const cStart = clusterCursor;
            const cEnd =
              cIdx === subClusters.length - 1 ? secEndDeg : clusterCursor + clusterSpan;
            clusterCursor = cEnd;

            const sliceComps = sec.competencies.slice(
              cluster.compRange[0],
              cluster.compRange[1]
            );
            const cTotal = sliceComps.length || secTotalGoals;
            const cDone = sliceComps.filter((c) => masteredCompetencies[c.id]).length;

            const tf = computeUprightWedgeLabelTransform(
              cx,
              cy,
              r3Inner,
              r3Outer,
              cStart,
              cEnd,
              false
            );

            wedges.push({
              id: `cluster_${sec.id}_${cIdx}`,
              level: 3,
              subjectId: subjId,
              sectionId: sec.id,
              sectionLetter: sec.sectionLetter,
              title: `Section ${sec.sectionLetter} · ${cluster.fullTitle}`,
              shortLabel: cluster.shortLabel,
              valueLabel: `(${cDone}/${cTotal})`,
              startDeg: Number(cStart.toFixed(3)),
              endDeg: Number(cEnd.toFixed(3)),
              spanDeg: Number((cEnd - cStart).toFixed(3)),
              rInner: r3Inner,
              rOuter: r3Outer,
              pathD: buildSunburstAnnularPath(cx, cy, r3Inner, r3Outer, cStart, cEnd),
              labelX: tf.x,
              labelY: tf.y,
              labelRotationDeg: tf.rotationDeg,
              labelOrientation: tf.orientation,
              attempts: 0,
              correct: 0,
              accuracyPercent: 0,
              hasPerformanceData: false,
              masteredGoals: cDone,
              totalGoals: cTotal,
              status: 'UNTESTED',
            });
          });
        } else if (secMasteredGoals > 0) {
          // Highlight cleared/partially mastered compact sections on the outer ring too
          const tf = computeUprightWedgeLabelTransform(
            cx,
            cy,
            r3Inner,
            r3Outer,
            secStartDeg,
            secEndDeg,
            false
          );
          wedges.push({
            id: `goals_${sec.id}`,
            level: 3,
            subjectId: subjId,
            sectionId: sec.id,
            sectionLetter: sec.sectionLetter,
            title: `Section ${sec.sectionLetter} · Syllabus Goals`,
            shortLabel: 'Goals',
            valueLabel: `(${secMasteredGoals}/${secTotalGoals})`,
            startDeg: Number(secStartDeg.toFixed(3)),
            endDeg: Number(secEndDeg.toFixed(3)),
            spanDeg: Number(actualSecSpan.toFixed(3)),
            rInner: r3Inner,
            rOuter: r3Outer,
            pathD: buildSunburstAnnularPath(
              cx,
              cy,
              r3Inner,
              r3Outer,
              secStartDeg,
              secEndDeg
            ),
            labelX: tf.x,
            labelY: tf.y,
            labelRotationDeg: tf.rotationDeg,
            labelOrientation: tf.orientation,
            attempts: 0,
            correct: 0,
            accuracyPercent: 0,
            hasPerformanceData: false,
            masteredGoals: secMasteredGoals,
            totalGoals: secTotalGoals,
            status: 'UNTESTED',
          });
        }
      }
    });
  }

  const anyPerf = report.totalAttempts > 0 || report.subjectStats.some((s) => s.status !== 'UNTESTED');
  const centerTitle = 'BLEPP Overall';
  const centerValue =
    report.totalAttempts > 0
      ? `(${Math.round(report.overallAccuracyPercent)}%)`
      : anyPerf
      ? `(${Math.round(
          report.subjectStats.reduce((a, s) => a + s.accuracyPercent, 0) /
            report.subjectStats.length
        )}%)`
      : `(${totalMasteredGoals}/${totalAllGoals})`;

  return {
    viewBoxSize,
    cx,
    cy,
    hubRadius,
    centerTitle,
    centerValue,
    totalAttempts: report.totalAttempts,
    totalCorrect: report.totalCorrect,
    overallAccuracyPercent: report.overallAccuracyPercent,
    totalMasteredGoals,
    totalAllGoals,
    wedges,
    subjectLegend,
  };
}

// ============================================================================
// STAR / RADAR GRAPH & WEIGHT-CODED SUBJECT ANALYSIS
// ============================================================================

export type StarGraphScope = 'ALL' | SubjectId;

export type StarAxisPaletteKey = SubjectId | 'weighted_gwa';

export type StarWeightTier = 'HIGH' | 'STANDARD' | 'COMPACT' | 'COMPOSITE';

export interface StarGraphSpokeNode {
  id: string;
  paletteKey: StarAxisPaletteKey;
  subjectId?: SubjectId;
  sectionId?: string;
  sectionLetter?: string;
  label: string;
  shortLabel: string;
  weightPercent: number;
  boardImpactPercent: number;
  weightLabel: string;
  weightTier: StarWeightTier;
  spokeStrokeWidth: number;
  vertexRadius: number;
  angleDeg: number;
  spokeEndX: number;
  spokeEndY: number;
  passingPointX: number;
  passingPointY: number;
  cutoffPointX: number;
  cutoffPointY: number;
  valuePointX: number;
  valuePointY: number;
  sectorPathD: string;
  labelX: number;
  labelY: number;
  textAnchor: 'start' | 'middle' | 'end';
  currentPercent: number;
  plotPercent: number;
  passingTargetPercent: number;
  cutoffPercent: number;
  weightedEarnedPoints: number;
  weightedMaxPoints: number;
  attempts: number;
  correct: number;
  masteredGoals: number;
  totalGoals: number;
  metricSource: 'QUIZ' | 'MOCK_GRADE' | 'GOALS' | 'UNTESTED';
  status: 'STRENGTH' | 'DEVELOPING' | 'WEAKNESS' | 'CUTOFF_RISK' | 'UNTESTED';
}

export interface StarAnalysisPointItem {
  id: string;
  subjectId: SubjectId;
  subjectShortTitle: string;
  sectionId?: string;
  sectionLetter?: string;
  title: string;
  weightPercent: number;
  boardImpactPercent: number;
  weightSummary: string;
  currentPercent: number;
  passingGapPercent: number;
  attempts: number;
  correct: number;
  masteredGoals: number;
  totalGoals: number;
  status: 'STRENGTH' | 'DEVELOPING' | 'WEAKNESS' | 'CUTOFF_RISK' | 'UNTESTED';
  promptReason: string;
  recommendedMode: 'practice' | 'tos';
  ctaLabel: string;
}

export interface SubjectStarGraphData {
  scope: StarGraphScope;
  scopeTitle: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
  cx: number;
  cy: number;
  maxRadius: number;
  passingTargetPercent: number;
  cutoffPercent: number;
  passingPolygonPoints: string;
  cutoffPolygonPoints: string;
  outerGuidePolygonPoints: string;
  scorePolygonPoints: string;
  weightedReadinessPercent: number;
  passingSubjectsCount: number;
  cutoffRiskCount: number;
  spokes: StarGraphSpokeNode[];
  strengths: StarAnalysisPointItem[];
  studyPrompts: StarAnalysisPointItem[];
}

const STAR_SUBJECT_SHORT_NAMES: Record<SubjectId, string> = {
  psych_assessment: 'Psych Assessment',
  dev_psych: 'Dev Psychology',
  abnormal_psych: 'Abnormal Psych',
  io_psych: 'I/O Psychology',
};

function polarToCartesian2D(
  cx: number,
  cy: number,
  radius: number,
  angleDegFromRight: number
): { x: number; y: number } {
  const rad = (angleDegFromRight * Math.PI) / 180;
  return {
    x: Number((cx + radius * Math.cos(rad)).toFixed(2)),
    y: Number((cy + radius * Math.sin(rad)).toFixed(2)),
  };
}

function classifyStarStatus(
  percent: number,
  hasTestedSignal: boolean,
  topnotcherMode: boolean = false,
  topnotcherTargetPercent: number = DEFAULT_TOPNOTCHER_TARGET_PERCENT
): StarGraphSpokeNode['status'] {
  if (!hasTestedSignal) return 'UNTESTED';
  if (topnotcherMode) {
    if (percent >= topnotcherTargetPercent) return 'STRENGTH';
    if (percent >= STANDARD_PASSING_TARGET_PERCENT) return 'DEVELOPING';
    if (percent >= SUBJECT_CUTOFF_PERCENT) return 'WEAKNESS';
    return 'CUTOFF_RISK';
  }
  if (percent >= STANDARD_PASSING_TARGET_PERCENT) return 'STRENGTH';
  if (percent >= 60) return 'DEVELOPING';
  if (percent >= SUBJECT_CUTOFF_PERCENT) return 'WEAKNESS';
  return 'CUTOFF_RISK';
}

/**
 * Builds a color-coded, weight-encoded Star / Radar Graph (matching the 5-spoke
 * reference geometry with extended bold radial axes, dashed 75% passing polygon,
 * dotted 50% subject-cutoff polygon, kite-partitioned color wedges, comparison rows,
 * and weight-prioritized Strengths & Weaknesses study prompts).
 */
export function buildSubjectStarGraphData(
  attemptLogs: QuestionAttemptLog[],
  subjectsMeta: Record<
    SubjectId,
    SubjectSectionMeta & {
      sections: {
        id: string;
        sectionLetter: string;
        title: string;
        weightPercent: number;
        competencies: { id: string; code: string; description: string }[];
      }[];
    }
  >,
  grades: SubjectGrades,
  masteredCompetencies: Record<string, boolean>,
  scope: StarGraphScope = 'ALL'
): SubjectStarGraphData {
  const viewBoxWidth = 520;
  const viewBoxHeight = 384;
  const cx = 260;
  const cy = 198;
  const maxRadius = 124;
  const spokeTipRadius = 138;
  const passingTargetPercent = 75;
  const cutoffPercent = 50;
  const minVisualPercent = 8;

  const report = analyzeStrengthsAndWeaknesses(attemptLogs, subjectsMeta, grades);

  // Per-subject aggregate metrics
  const subjectIds: SubjectId[] = [
    'psych_assessment',
    'dev_psych',
    'abnormal_psych',
    'io_psych',
  ];

  const subjectMetrics = new Map<
    SubjectId,
    {
      currentPercent: number;
      hasTestedSignal: boolean;
      metricSource: StarGraphSpokeNode['metricSource'];
      attempts: number;
      correct: number;
      masteredGoals: number;
      totalGoals: number;
      weightPercent: number;
    }
  >();

  for (const subjId of subjectIds) {
    const subj = subjectsMeta[subjId];
    const stat = report.subjectStats.find((s) => s.subjectId === subjId)!;
    let totalGoals = 0;
    let masteredGoals = 0;
    for (const sec of subj.sections) {
      for (const comp of sec.competencies) {
        totalGoals++;
        if (masteredCompetencies[comp.id]) masteredGoals++;
      }
    }

    let currentPercent = 0;
    let metricSource: StarGraphSpokeNode['metricSource'] = 'UNTESTED';
    let hasTestedSignal = false;

    if (stat.attempts > 0) {
      currentPercent = stat.accuracyPercent;
      metricSource = 'QUIZ';
      hasTestedSignal = true;
    } else if (grades[subjId] > 0) {
      currentPercent = Number(grades[subjId].toFixed(1));
      metricSource = 'MOCK_GRADE';
      hasTestedSignal = true;
    } else if (masteredGoals > 0 && totalGoals > 0) {
      currentPercent = Number(((masteredGoals / totalGoals) * 100).toFixed(1));
      metricSource = 'GOALS';
      hasTestedSignal = false;
    }

    subjectMetrics.set(subjId, {
      currentPercent,
      hasTestedSignal,
      metricSource,
      attempts: stat.attempts,
      correct: stat.correct,
      masteredGoals,
      totalGoals,
      weightPercent: subj.weightPercent,
    });
  }

  let weightedSum = 0;
  let anySubjectTested = false;
  let anySubjectGoals = false;
  let totalAllAttempts = 0;
  let totalAllCorrect = 0;
  let totalAllGoals = 0;
  let totalAllMastered = 0;
  let passingSubjectsCount = 0;
  let cutoffRiskCount = 0;

  for (const subjId of subjectIds) {
    const m = subjectMetrics.get(subjId)!;
    weightedSum += m.currentPercent * (m.weightPercent / 100);
    if (m.hasTestedSignal) {
      anySubjectTested = true;
      if (m.currentPercent >= 75) passingSubjectsCount++;
      if (m.currentPercent < 50) cutoffRiskCount++;
    } else if (m.masteredGoals > 0) {
      anySubjectGoals = true;
    }
    totalAllAttempts += m.attempts;
    totalAllCorrect += m.correct;
    totalAllGoals += m.totalGoals;
    totalAllMastered += m.masteredGoals;
  }

  const weightedReadinessPercent = Number(weightedSum.toFixed(1));

  interface RawSpokeInput {
    id: string;
    paletteKey: StarAxisPaletteKey;
    subjectId?: SubjectId;
    sectionId?: string;
    sectionLetter?: string;
    label: string;
    shortLabel: string;
    weightPercent: number;
    boardImpactPercent: number;
    weightLabel: string;
    weightTier: StarWeightTier;
    spokeStrokeWidth: number;
    vertexRadius: number;
    currentPercent: number;
    weightedEarnedPoints: number;
    weightedMaxPoints: number;
    attempts: number;
    correct: number;
    masteredGoals: number;
    totalGoals: number;
    metricSource: StarGraphSpokeNode['metricSource'];
    status: StarGraphSpokeNode['status'];
  }

  const rawSpokes: RawSpokeInput[] = [];

  if (scope === 'ALL') {
    // 5-Spoke Star Geometry (matching reference pentagon star):
    // Top (-90°): Psych Assessment (40% Wt — Highest Weight Anchor)
    // Upper-Right (-18°): Dev Psychology (20% Wt)
    // Lower-Right (+54°): Abnormal Psych (20% Wt)
    // Lower-Left (+126°): I/O Psychology (20% Wt)
    // Upper-Left (+198°): Weighted GWA (100% Composite)
    const orderedAxes: StarAxisPaletteKey[] = [
      'psych_assessment',
      'dev_psych',
      'abnormal_psych',
      'io_psych',
      'weighted_gwa',
    ];

    for (const axisKey of orderedAxes) {
      if (axisKey === 'weighted_gwa') {
        const gwaSource: StarGraphSpokeNode['metricSource'] = anySubjectTested
          ? totalAllAttempts > 0
            ? 'QUIZ'
            : 'MOCK_GRADE'
          : anySubjectGoals
          ? 'GOALS'
          : 'UNTESTED';
        rawSpokes.push({
          id: 'axis_weighted_gwa',
          paletteKey: 'weighted_gwa',
          label: 'Weighted GWA Readiness',
          shortLabel: 'Weighted GWA',
          weightPercent: 100,
          boardImpactPercent: 100,
          weightLabel: '100% Total',
          weightTier: 'COMPOSITE',
          spokeStrokeWidth: 3.2,
          vertexRadius: 5,
          currentPercent: weightedReadinessPercent,
          weightedEarnedPoints: weightedReadinessPercent,
          weightedMaxPoints: 100,
          attempts: totalAllAttempts,
          correct: totalAllCorrect,
          masteredGoals: totalAllMastered,
          totalGoals: totalAllGoals,
          metricSource: gwaSource,
          status: classifyStarStatus(weightedReadinessPercent, anySubjectTested),
        });
      } else {
        const subj = subjectsMeta[axisKey];
        const m = subjectMetrics.get(axisKey)!;
        const isHighWeight = subj.weightPercent >= 40;
        const earnedPts = Number(
          ((m.currentPercent * subj.weightPercent) / 100).toFixed(1)
        );
        rawSpokes.push({
          id: `axis_${axisKey}`,
          paletteKey: axisKey,
          subjectId: axisKey,
          label: subj.fullTitle,
          shortLabel: STAR_SUBJECT_SHORT_NAMES[axisKey],
          weightPercent: subj.weightPercent,
          boardImpactPercent: subj.weightPercent,
          weightLabel: `${subj.weightPercent}% Wt`,
          weightTier: isHighWeight ? 'HIGH' : 'STANDARD',
          spokeStrokeWidth: isHighWeight ? 4.3 : 2.5,
          vertexRadius: isHighWeight ? 5.8 : 4.5,
          currentPercent: m.currentPercent,
          weightedEarnedPoints: earnedPts,
          weightedMaxPoints: subj.weightPercent,
          attempts: m.attempts,
          correct: m.correct,
          masteredGoals: m.masteredGoals,
          totalGoals: m.totalGoals,
          metricSource: m.metricSource,
          status: classifyStarStatus(m.currentPercent, m.hasTestedSignal),
        });
      }
    }
  } else {
    const subj = subjectsMeta[scope];
    for (const sec of subj.sections) {
      const topicStat = report.allTopicStats.find(
        (t) => t.subjectId === scope && t.sectionId === sec.id
      );
      const secAttempts = topicStat ? topicStat.attempts : 0;
      const secCorrect = topicStat ? topicStat.correct : 0;
      const secTotalGoals = sec.competencies.length;
      const secMasteredGoals = sec.competencies.filter(
        (c) => masteredCompetencies[c.id]
      ).length;

      let secPercent = 0;
      let secSource: StarGraphSpokeNode['metricSource'] = 'UNTESTED';
      const hasTested = secAttempts > 0;
      if (hasTested && topicStat) {
        secPercent = topicStat.accuracyPercent;
        secSource = 'QUIZ';
      } else if (secMasteredGoals > 0 && secTotalGoals > 0) {
        secPercent = Number(((secMasteredGoals / secTotalGoals) * 100).toFixed(1));
        secSource = 'GOALS';
      }

      const weightTier: StarWeightTier =
        sec.weightPercent >= 30
          ? 'HIGH'
          : sec.weightPercent >= 15
          ? 'STANDARD'
          : 'COMPACT';
      const spokeStrokeWidth = Number(
        Math.min(4.5, Math.max(1.9, 1.6 + sec.weightPercent * 0.058)).toFixed(2)
      );
      const vertexRadius =
        weightTier === 'HIGH' ? 5.8 : weightTier === 'STANDARD' ? 4.6 : 3.9;
      const boardImpact = Number(
        ((subj.weightPercent * sec.weightPercent) / 100).toFixed(1)
      );
      const earnedSecPts = Number(
        ((secPercent * sec.weightPercent) / 100).toFixed(1)
      );

      rawSpokes.push({
        id: `axis_${sec.id}`,
        paletteKey: scope,
        subjectId: scope,
        sectionId: sec.id,
        sectionLetter: sec.sectionLetter,
        label: `Section ${sec.sectionLetter}: ${sec.title}`,
        shortLabel: `Sec ${sec.sectionLetter} · ${
          SUNBURST_SECTION_SHORT_LABELS[sec.id] || sec.title.slice(0, 14)
        }`,
        weightPercent: sec.weightPercent,
        boardImpactPercent: boardImpact,
        weightLabel: `${sec.weightPercent}% Wt`,
        weightTier,
        spokeStrokeWidth,
        vertexRadius,
        currentPercent: secPercent,
        weightedEarnedPoints: earnedSecPts,
        weightedMaxPoints: sec.weightPercent,
        attempts: secAttempts,
        correct: secCorrect,
        masteredGoals: secMasteredGoals,
        totalGoals: secTotalGoals,
        metricSource: secSource,
        status: classifyStarStatus(secPercent, hasTested),
      });
    }
  }

  const count = rawSpokes.length;
  const stepDeg = 360 / count;

  // Precompute geometry points per spoke
  const prelimCoords = rawSpokes.map((raw, idx) => {
    const angleDeg = -90 + idx * stepDeg;
    const plotPercent = Math.min(100, Math.max(minVisualPercent, raw.currentPercent));
    const spokeEnd = polarToCartesian2D(cx, cy, spokeTipRadius, angleDeg);
    const outerGuidePt = polarToCartesian2D(cx, cy, maxRadius, angleDeg);
    const passingPt = polarToCartesian2D(
      cx,
      cy,
      (passingTargetPercent / 100) * maxRadius,
      angleDeg
    );
    const cutoffPt = polarToCartesian2D(
      cx,
      cy,
      (cutoffPercent / 100) * maxRadius,
      angleDeg
    );
    const valuePt = polarToCartesian2D(
      cx,
      cy,
      (plotPercent / 100) * maxRadius,
      angleDeg
    );

    const cosVal = Math.cos((angleDeg * Math.PI) / 180);
    const sinVal = Math.sin((angleDeg * Math.PI) / 180);
    let textAnchor: 'start' | 'middle' | 'end' = 'middle';
    let labelOffset = 15;
    let extraYShift = 0;
    if (cosVal > 0.28) {
      textAnchor = 'start';
      labelOffset = 11;
      if (sinVal > 0.55) extraYShift = 6;
    } else if (cosVal < -0.28) {
      textAnchor = 'end';
      labelOffset = 11;
      if (sinVal > 0.55) extraYShift = 6;
    } else if (sinVal < -0.7) {
      labelOffset = 22;
      extraYShift = -6;
    } else {
      labelOffset = 20;
      extraYShift = 6;
    }
    const rawLabelPt = polarToCartesian2D(
      cx,
      cy,
      spokeTipRadius + labelOffset,
      angleDeg
    );
    const labelPt = {
      x: rawLabelPt.x,
      y: Number((rawLabelPt.y + extraYShift).toFixed(2)),
    };

    return {
      angleDeg: Number(angleDeg.toFixed(2)),
      plotPercent: Number(plotPercent.toFixed(1)),
      spokeEnd,
      outerGuidePt,
      passingPt,
      cutoffPt,
      valuePt,
      labelPt,
      textAnchor,
    };
  });

  const spokes: StarGraphSpokeNode[] = rawSpokes.map((raw, idx) => {
    const curr = prelimCoords[idx];
    const prev = prelimCoords[(idx - 1 + count) % count];
    const next = prelimCoords[(idx + 1) % count];

    const midPrevX = Number(((prev.valuePt.x + curr.valuePt.x) / 2).toFixed(2));
    const midPrevY = Number(((prev.valuePt.y + curr.valuePt.y) / 2).toFixed(2));
    const midNextX = Number(((curr.valuePt.x + next.valuePt.x) / 2).toFixed(2));
    const midNextY = Number(((curr.valuePt.y + next.valuePt.y) / 2).toFixed(2));

    const sectorPathD = [
      `M ${cx} ${cy}`,
      `L ${midPrevX} ${midPrevY}`,
      `L ${curr.valuePt.x} ${curr.valuePt.y}`,
      `L ${midNextX} ${midNextY}`,
      'Z',
    ].join(' ');

    return {
      ...raw,
      angleDeg: curr.angleDeg,
      spokeEndX: curr.spokeEnd.x,
      spokeEndY: curr.spokeEnd.y,
      passingPointX: curr.passingPt.x,
      passingPointY: curr.passingPt.y,
      cutoffPointX: curr.cutoffPt.x,
      cutoffPointY: curr.cutoffPt.y,
      valuePointX: curr.valuePt.x,
      valuePointY: curr.valuePt.y,
      sectorPathD,
      labelX: curr.labelPt.x,
      labelY: curr.labelPt.y,
      textAnchor: curr.textAnchor,
      plotPercent: curr.plotPercent,
      passingTargetPercent,
      cutoffPercent,
    };
  });

  const passingPolygonPoints = prelimCoords
    .map((c) => `${c.passingPt.x},${c.passingPt.y}`)
    .join(' ');
  const cutoffPolygonPoints = prelimCoords
    .map((c) => `${c.cutoffPt.x},${c.cutoffPt.y}`)
    .join(' ');
  const outerGuidePolygonPoints = prelimCoords
    .map((c) => `${c.outerGuidePt.x},${c.outerGuidePt.y}`)
    .join(' ');
  const scorePolygonPoints = prelimCoords
    .map((c) => `${c.valuePt.x},${c.valuePt.y}`)
    .join(' ');

  // Build Strengths & Weaknesses / Study Prompts across relevant sections
  const targetSubjectIds: SubjectId[] =
    scope === 'ALL'
      ? ['psych_assessment', 'dev_psych', 'abnormal_psych', 'io_psych']
      : [scope];

  const allSectionItems: (StarAnalysisPointItem & { priorityScore: number })[] = [];

  for (const subjId of targetSubjectIds) {
    const subj = subjectsMeta[subjId];
    for (const sec of subj.sections) {
      const topicStat = report.allTopicStats.find(
        (t) => t.subjectId === subjId && t.sectionId === sec.id
      );
      const attempts = topicStat ? topicStat.attempts : 0;
      const correct = topicStat ? topicStat.correct : 0;
      const acc = topicStat ? topicStat.accuracyPercent : 0;
      const totalGoals = sec.competencies.length;
      const masteredGoals = sec.competencies.filter(
        (c) => masteredCompetencies[c.id]
      ).length;
      const boardImpact = Number(
        ((subj.weightPercent * sec.weightPercent) / 100).toFixed(1)
      );
      const hasTested = attempts > 0;
      const status = classifyStarStatus(acc, hasTested);
      const passingGap = hasTested
        ? Number(Math.max(0, passingTargetPercent - acc).toFixed(1))
        : passingTargetPercent;

      const weightSummary =
        scope === 'ALL'
          ? `${boardImpact}% Board Wt (${sec.weightPercent}% of ${STAR_SUBJECT_SHORT_NAMES[subjId]})`
          : `${sec.weightPercent}% Subject Wt (${boardImpact}% Board Wt)`;

      let promptReason = '';
      let recommendedMode: 'practice' | 'tos' = 'practice';
      let priorityScore = 0;

      if (status === 'CUTOFF_RISK') {
        promptReason = `${acc}% accuracy — below the 50% cutoff; needs +${passingGap}% to reach 75% passing.`;
        recommendedMode = 'practice';
        priorityScore = 1000 + boardImpact * (75 - acc);
      } else if (status === 'WEAKNESS') {
        promptReason = `${acc}% accuracy — needs +${passingGap}% to reach the 75% passing line.`;
        recommendedMode = 'practice';
        priorityScore = 700 + boardImpact * (75 - acc);
      } else if (status === 'DEVELOPING') {
        promptReason = `${acc}% accuracy — borderline; +${passingGap}% more clears 75% passing.`;
        recommendedMode = 'practice';
        priorityScore = 400 + boardImpact * (75 - acc);
      } else if (status === 'UNTESTED') {
        promptReason =
          masteredGoals > 0
            ? `Untested in quizzes (${masteredGoals}/${totalGoals} goals cleared) — take a Section ${sec.sectionLetter} quiz to measure passing readiness.`
            : `Untested high-yield section (${sec.weightPercent}% of ${STAR_SUBJECT_SHORT_NAMES[subjId]}) — study syllabus goals or start a Section ${sec.sectionLetter} quiz.`;
        recommendedMode = masteredGoals > 0 ? 'practice' : 'tos';
        priorityScore = 100 + boardImpact * 12;
      } else {
        promptReason = `${acc}% accuracy (${correct}/${attempts} correct) — exceeds the 75% BLEPP passing rate.`;
        priorityScore = boardImpact * acc;
      }

      const ctaLabel =
        recommendedMode === 'tos'
          ? `Study ${STAR_SUBJECT_SHORT_NAMES[subjId]} Sec ${sec.sectionLetter}`
          : `Practice Sec ${sec.sectionLetter}`;

      allSectionItems.push({
        id: `${subjId}_${sec.id}`,
        subjectId: subjId,
        subjectShortTitle: STAR_SUBJECT_SHORT_NAMES[subjId],
        sectionId: sec.id,
        sectionLetter: sec.sectionLetter,
        title:
          scope === 'ALL'
            ? `${STAR_SUBJECT_SHORT_NAMES[subjId]} · Sec ${sec.sectionLetter}: ${sec.title}`
            : `Section ${sec.sectionLetter}: ${sec.title}`,
        weightPercent: sec.weightPercent,
        boardImpactPercent: boardImpact,
        weightSummary,
        currentPercent: acc,
        passingGapPercent: passingGap,
        attempts,
        correct,
        masteredGoals,
        totalGoals,
        status,
        promptReason,
        recommendedMode,
        ctaLabel,
        priorityScore,
      });
    }
  }

  // Also include subject-level Mock Rating weaknesses if a subject has a Mock Grade < 75% but 0 section quiz logs
  if (scope === 'ALL') {
    for (const subjId of targetSubjectIds) {
      const m = subjectMetrics.get(subjId)!;
      if (m.metricSource === 'MOCK_GRADE') {
        const subj = subjectsMeta[subjId];
        const status = classifyStarStatus(m.currentPercent, true);
        const gap = Number(
          Math.max(0, passingTargetPercent - m.currentPercent).toFixed(1)
        );
        if (status === 'STRENGTH') {
          allSectionItems.push({
            id: `subj_grade_${subjId}`,
            subjectId: subjId,
            subjectShortTitle: STAR_SUBJECT_SHORT_NAMES[subjId],
            title: `${subj.fullTitle} (Mock Rating)`,
            weightPercent: subj.weightPercent,
            boardImpactPercent: subj.weightPercent,
            weightSummary: `${subj.weightPercent}% Board Wt`,
            currentPercent: m.currentPercent,
            passingGapPercent: 0,
            attempts: 0,
            correct: 0,
            masteredGoals: m.masteredGoals,
            totalGoals: m.totalGoals,
            status: 'STRENGTH',
            promptReason: `${m.currentPercent}% mock rating — above the 75% passing target.`,
            recommendedMode: 'practice',
            ctaLabel: `Practice ${STAR_SUBJECT_SHORT_NAMES[subjId]}`,
            priorityScore: subj.weightPercent * m.currentPercent,
          });
        } else {
          allSectionItems.unshift({
            id: `subj_grade_${subjId}`,
            subjectId: subjId,
            subjectShortTitle: STAR_SUBJECT_SHORT_NAMES[subjId],
            title: `${subj.fullTitle} (Mock Rating)`,
            weightPercent: subj.weightPercent,
            boardImpactPercent: subj.weightPercent,
            weightSummary: `${subj.weightPercent}% Board Wt`,
            currentPercent: m.currentPercent,
            passingGapPercent: gap,
            attempts: 0,
            correct: 0,
            masteredGoals: m.masteredGoals,
            totalGoals: m.totalGoals,
            status,
            promptReason: `${m.currentPercent}% mock rating — needs +${gap}% to reach 75% passing.`,
            recommendedMode: 'practice',
            ctaLabel: `Practice ${STAR_SUBJECT_SHORT_NAMES[subjId]}`,
            priorityScore:
              (status === 'CUTOFF_RISK' ? 1100 : 800) +
              subj.weightPercent * gap,
          });
        }
      }
    }
  }

  const strengths = allSectionItems
    .filter((item) => item.status === 'STRENGTH')
    .sort(
      (a, b) =>
        b.boardImpactPercent - a.boardImpactPercent ||
        b.currentPercent - a.currentPercent
    )
    .slice(0, 4)
    .map(({ priorityScore: _p, ...rest }) => rest);

  const studyPrompts = allSectionItems
    .filter((item) => item.status !== 'STRENGTH')
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 4)
    .map(({ priorityScore: _p, ...rest }) => rest);

  const scopeTitle =
    scope === 'ALL'
      ? 'All Subjects · Board Weight & Passing Analysis'
      : `${subjectsMeta[scope].fullTitle} (${subjectsMeta[scope].weightPercent}% Board Weight)`;

  return {
    scope,
    scopeTitle,
    viewBoxWidth,
    viewBoxHeight,
    cx,
    cy,
    maxRadius,
    passingTargetPercent,
    cutoffPercent,
    passingPolygonPoints,
    cutoffPolygonPoints,
    outerGuidePolygonPoints,
    scorePolygonPoints,
    weightedReadinessPercent,
    passingSubjectsCount,
    cutoffRiskCount,
    spokes,
    strengths,
    studyPrompts,
  };
}

// ============================================================================
// MARIMEKKO (WEIGHT-BY-SCORE) THRESHOLD CHART BUILDERS
// ============================================================================

export type MarimekkoStatus =
  | 'STRENGTH'
  | 'DEVELOPING'
  | 'WEAKNESS'
  | 'CUTOFF_RISK'
  | 'UNTESTED';

export interface MarimekkoAxisTick {
  percent: number;
  y: number;
  labelY?: number;
}

function buildMarimekkoYTicks(
  scoreToY: (pct: number) => number,
  topnotcherMode: boolean,
  topnotcherTargetPercent: number
): MarimekkoAxisTick[] {
  const rawPercents = topnotcherMode
    ? Array.from(new Set([100, topnotcherTargetPercent, 75, 50, 25, 0])).sort(
        (a, b) => b - a
      )
    : [100, 75, 50, 25, 0];

  return rawPercents.map((pct) => {
    const y = scoreToY(pct);
    let labelY = y;
    if (topnotcherMode) {
      if (topnotcherTargetPercent >= 96) {
        if (pct === 100) labelY = Number((y - 4).toFixed(2));
        if (pct === topnotcherTargetPercent) labelY = Number((y + 4).toFixed(2));
      } else if (topnotcherTargetPercent <= 79) {
        if (pct === topnotcherTargetPercent) labelY = Number((y - 4).toFixed(2));
        if (pct === 75) labelY = Number((y + 4).toFixed(2));
      }
    }
    return { percent: pct, y, labelY };
  });
}

export interface SubjectMarimekkoColumn {
  id: string;
  subjectId: SubjectId;
  title: string;
  shortTitle: string;
  compactTitle: string;
  weightPercent: number;
  cumulativeStartWeight: number;
  cumulativeEndWeight: number;
  x: number;
  width: number;
  centerX: number;
  trackY: number;
  trackHeight: number;
  barY: number;
  barHeight: number;
  deficitY: number;
  deficitHeight: number;
  currentPercent: number;
  passingTargetPercent: number;
  cutoffPercent: number;
  earnedWeightedPoints: number;
  passingWeightedPoints: number;
  maxWeightedPoints: number;
  weightedGapToPassing: number;
  attempts: number;
  correct: number;
  masteredGoals: number;
  totalGoals: number;
  metricSource: 'QUIZ' | 'MOCK_GRADE' | 'UNTESTED';
  status: MarimekkoStatus;
  prioritySectionId: string;
  prioritySectionTitle: string | null;
  prioritySectionPercent: number | null;
  focusHint: string;
  recommendedMode: 'practice' | 'tos';
  ctaLabel: string;
}

export interface SubjectMarimekkoChartData {
  viewBoxWidth: number;
  viewBoxHeight: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  plotWidth: number;
  plotHeight: number;
  topnotcherMode: boolean;
  activeTargetPercent: number;
  topnotcherTargetPercent: number;
  passingTargetPercent: number;
  cutoffPercent: number;
  activeTargetLineY: number;
  topnotcherLineY: number;
  passingLineY: number;
  cutoffLineY: number;
  yTicks: MarimekkoAxisTick[];
  weightedReadinessPercent: number;
  weightedGapToOverallPassing: number;
  passingSubjectsCount: number;
  testedSubjectsCount: number;
  cutoffRiskCount: number;
  columns: SubjectMarimekkoColumn[];
  studyPrompts: SubjectMarimekkoColumn[];
  strengths: SubjectMarimekkoColumn[];
}

export interface SectionMarimekkoColumn {
  id: string;
  subjectId: SubjectId;
  sectionId: string;
  sectionLetter: string;
  sectionTitle: string;
  shortLabel: string;
  weightPercent: number;
  boardImpactPercent: number;
  x: number;
  width: number;
  centerX: number;
  trackY: number;
  trackHeight: number;
  barY: number;
  barHeight: number;
  deficitY: number;
  deficitHeight: number;
  currentPercent: number;
  earnedSectionPoints: number;
  maxSectionPoints: number;
  attempts: number;
  correct: number;
  masteredGoals: number;
  totalGoals: number;
  status: MarimekkoStatus;
}

export interface SectionMarimekkoChartData {
  subjectId: SubjectId;
  subjectTitle: string;
  subjectBoardWeightPercent: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  plotWidth: number;
  plotHeight: number;
  topnotcherMode: boolean;
  activeTargetPercent: number;
  topnotcherTargetPercent: number;
  passingTargetPercent: number;
  cutoffPercent: number;
  activeTargetLineY: number;
  topnotcherLineY: number;
  passingLineY: number;
  cutoffLineY: number;
  yTicks: MarimekkoAxisTick[];
  subjectSectionWeightedScore: number;
  columns: SectionMarimekkoColumn[];
}

const MARIMEKKO_SUBJECT_COMPACT: Record<SubjectId, string> = {
  psych_assessment: 'Psych Assessment',
  dev_psych: 'Dev Psych',
  abnormal_psych: 'Abnormal Psych',
  io_psych: 'I/O Psych',
};

/**
 * Builds the 4-Subject Marimekko (Weight-by-Score) Threshold Chart for the Home Screen.
 * Column widths strictly mirror official BLEPP subject weights (40% | 20% | 20% | 20%),
 * while vertical fill represents score (0-100%) crossed by 75% Passing (plus 85% Topnotcher when active) and 50% Cutoff lines.
 */
export function buildSubjectMarimekkoData(
  attemptLogs: QuestionAttemptLog[],
  subjectsMeta: Record<
    SubjectId,
    Omit<SubjectSectionMeta, 'sections'> & {
      sections: {
        id: string;
        sectionLetter: string;
        title: string;
        weightPercent: number;
        competencies: { id: string; code: string; description: string }[];
      }[];
    }
  >,
  grades: SubjectGrades,
  masteredCompetencies: Record<string, boolean>,
  options?: StrengthWeaknessAnalysisOptions
): SubjectMarimekkoChartData {
  const topnotcherMode = Boolean(options?.topnotcherMode);
  const effectiveGrades = options?.ignoreManualGrades ? ZERO_SUBJECT_GRADES : grades;
  const viewBoxWidth = 560;
  const viewBoxHeight = 274;
  const plotLeft = 44;
  const plotRight = 548;
  const plotTop = 22;
  const plotBottom = 232;
  const plotWidth = plotRight - plotLeft; // 504
  const plotHeight = plotBottom - plotTop; // 210
  const passingTargetPercent = STANDARD_PASSING_TARGET_PERCENT;
  const topnotcherTargetPercent = normalizeTopnotcherThreshold(
    options?.topnotcherThreshold
  );
  const fmtTop = formatThresholdPercent(topnotcherTargetPercent);
  const activeTargetPercent = topnotcherMode
    ? topnotcherTargetPercent
    : passingTargetPercent;
  const cutoffPercent = SUBJECT_CUTOFF_PERCENT;
  const columnGapPx = 4;

  const scoreToY = (pct: number): number => {
    const clamped = Math.min(100, Math.max(0, pct));
    return Number((plotBottom - (clamped / 100) * plotHeight).toFixed(2));
  };

  const passingLineY = scoreToY(passingTargetPercent);
  const topnotcherLineY = scoreToY(topnotcherTargetPercent);
  const activeTargetLineY = topnotcherMode ? topnotcherLineY : passingLineY;
  const cutoffLineY = scoreToY(cutoffPercent);
  const yTicks: MarimekkoAxisTick[] = buildMarimekkoYTicks(
    scoreToY,
    topnotcherMode,
    topnotcherTargetPercent
  );

  const report = analyzeStrengthsAndWeaknesses(
    attemptLogs,
    subjectsMeta,
    effectiveGrades,
    options
  );

  // Order with highest-weight 40% Psychological Assessment anchoring left, followed by the three 20% subjects
  const orderedSubjects: SubjectId[] = [
    'psych_assessment',
    'dev_psych',
    'abnormal_psych',
    'io_psych',
  ];

  const totalWeight = orderedSubjects.reduce(
    (sum, id) => sum + subjectsMeta[id].weightPercent,
    0
  );
  const usableWidth = plotWidth - columnGapPx * (orderedSubjects.length - 1);

  let cursorX = plotLeft;
  let cumulativeWeight = 0;

  const columns: SubjectMarimekkoColumn[] = orderedSubjects.map((subjId) => {
    const subj = subjectsMeta[subjId];
    const stat = report.subjectStats.find((s) => s.subjectId === subjId)!;

    let totalGoals = 0;
    let masteredGoals = 0;
    for (const sec of subj.sections) {
      for (const comp of sec.competencies) {
        totalGoals++;
        if (masteredCompetencies[comp.id]) masteredGoals++;
      }
    }

    let currentPercent = 0;
    let metricSource: SubjectMarimekkoColumn['metricSource'] = 'UNTESTED';
    let hasTestedSignal = false;

    if (stat.attempts > 0) {
      currentPercent = stat.accuracyPercent;
      metricSource = 'QUIZ';
      hasTestedSignal = true;
    } else if (effectiveGrades[subjId] > 0) {
      currentPercent = Number(effectiveGrades[subjId].toFixed(1));
      metricSource = 'MOCK_GRADE';
      hasTestedSignal = true;
    }

    const status: MarimekkoStatus = classifyStarStatus(
      currentPercent,
      hasTestedSignal,
      topnotcherMode,
      topnotcherTargetPercent
    );

    const colWidth = Number(
      ((subj.weightPercent / totalWeight) * usableWidth).toFixed(2)
    );
    const colX = Number(cursorX.toFixed(2));
    const centerX = Number((colX + colWidth / 2).toFixed(2));
    cursorX += colWidth + columnGapPx;

    const startWt = cumulativeWeight;
    const endWt = cumulativeWeight + subj.weightPercent;
    cumulativeWeight = endWt;

    const barY = scoreToY(currentPercent);
    const barHeight = Number((plotBottom - barY).toFixed(2));

    // Deficit zone between currentPercent and active target line (75% Passing or 85% Topnotcher)
    const deficitTopY = currentPercent < activeTargetPercent ? activeTargetLineY : barY;
    const deficitHeight =
      currentPercent < activeTargetPercent
        ? Number((barY - activeTargetLineY).toFixed(2))
        : 0;

    const earnedWeightedPoints = Number(
      ((currentPercent * subj.weightPercent) / 100).toFixed(2)
    );
    const passingWeightedPoints = Number(
      ((activeTargetPercent * subj.weightPercent) / 100).toFixed(2)
    );
    const weightedGapToPassing = Number(
      Math.max(0, passingWeightedPoints - earnedWeightedPoints).toFixed(2)
    );

    // Derive a crisp 1-line focus hint for this subject against activeTargetPercent
    const subjTopics = report.allTopicStats.filter((t) => t.subjectId === subjId);
    const weakestTestedSec = [...subjTopics]
      .filter((t) => t.attempts > 0 && t.accuracyPercent < activeTargetPercent)
      .sort(
        (a, b) =>
          (activeTargetPercent - b.accuracyPercent) * b.boardWeightPercent -
          (activeTargetPercent - a.accuracyPercent) * a.boardWeightPercent
      )[0];
    const heaviestUntestedSec = [...subjTopics]
      .filter((t) => t.attempts === 0)
      .sort((a, b) => b.boardWeightPercent - a.boardWeightPercent)[0];

    let prioritySectionId = 'ALL';
    let prioritySectionTitle: string | null = null;
    let prioritySectionPercent: number | null = null;

    if (weakestTestedSec) {
      prioritySectionId = weakestTestedSec.sectionId;
      prioritySectionTitle = `Section ${weakestTestedSec.sectionLetter}. ${weakestTestedSec.sectionTitle}`;
      prioritySectionPercent = weakestTestedSec.accuracyPercent;
    } else if (heaviestUntestedSec) {
      prioritySectionId = heaviestUntestedSec.sectionId;
      prioritySectionTitle = `Section ${heaviestUntestedSec.sectionLetter}. ${heaviestUntestedSec.sectionTitle}`;
      prioritySectionPercent = null;
    }

    let focusHint = '';
    if (prioritySectionTitle && prioritySectionPercent !== null) {
      focusHint = `${prioritySectionTitle} (${prioritySectionPercent}%)`;
    } else if (prioritySectionTitle) {
      focusHint = prioritySectionTitle;
    } else if (!hasTestedSignal) {
      focusHint = 'Take a practice quiz to measure this subject.';
    } else {
      focusHint = topnotcherMode
        ? `Review syllabus sections below ${fmtTop}% to secure Topnotcher GWA.`
        : 'Review syllabus sections below 75%.';
    }

    const recommendedMode: 'practice' | 'tos' = 'tos';
    const ctaLabel =
      !hasTestedSignal && masteredGoals === 0
        ? 'Study'
        : topnotcherMode && currentPercent >= STANDARD_PASSING_TARGET_PERCENT
        ? `Push to ${fmtTop}%`
        : 'Practice';

    return {
      id: `mekko_${subjId}`,
      subjectId: subjId,
      title: subj.fullTitle,
      shortTitle: STAR_SUBJECT_SHORT_NAMES[subjId],
      compactTitle: MARIMEKKO_SUBJECT_COMPACT[subjId],
      weightPercent: subj.weightPercent,
      cumulativeStartWeight: startWt,
      cumulativeEndWeight: endWt,
      x: colX,
      width: colWidth,
      centerX,
      trackY: plotTop,
      trackHeight: plotHeight,
      barY,
      barHeight,
      deficitY: deficitTopY,
      deficitHeight,
      currentPercent: Number(currentPercent.toFixed(1)),
      passingTargetPercent: activeTargetPercent,
      cutoffPercent,
      earnedWeightedPoints,
      passingWeightedPoints,
      maxWeightedPoints: subj.weightPercent,
      weightedGapToPassing,
      attempts: stat.attempts,
      correct: stat.correct,
      masteredGoals,
      totalGoals,
      metricSource,
      status,
      prioritySectionId,
      prioritySectionTitle,
      prioritySectionPercent,
      focusHint,
      recommendedMode,
      ctaLabel,
    };
  });

  const weightedReadinessPercent = Number(
    columns.reduce((sum, c) => sum + c.earnedWeightedPoints, 0).toFixed(1)
  );
  const weightedGapToOverallPassing = Number(
    Math.max(0, activeTargetPercent - weightedReadinessPercent).toFixed(1)
  );
  const testedColumns = columns.filter((c) => c.metricSource !== 'UNTESTED');
  const passingSubjectsCount = testedColumns.filter(
    (c) => c.currentPercent >= activeTargetPercent
  ).length;
  const cutoffRiskCount = testedColumns.filter(
    (c) => c.currentPercent < cutoffPercent
  ).length;

  const studyPrompts = [...columns]
    .filter((c) => c.status !== 'STRENGTH')
    .sort((a, b) => {
      const rankScore = (col: SubjectMarimekkoColumn): number => {
        if (col.status === 'CUTOFF_RISK') return 3000 + col.weightedGapToPassing * 20;
        if (col.status === 'WEAKNESS') {
          return 2000 + col.weightedGapToPassing * 20;
        }
        if (col.status === 'DEVELOPING') {
          return 1500 + col.weightedGapToPassing * 20;
        }
        // UNTESTED ranked by board weight (40% ahead of 20%)
        return 500 + col.weightPercent * 10;
      };
      return rankScore(b) - rankScore(a);
    });

  const strengths = [...columns]
    .filter((c) => c.status === 'STRENGTH')
    .sort((a, b) => b.earnedWeightedPoints - a.earnedWeightedPoints);

  return {
    viewBoxWidth,
    viewBoxHeight,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    plotWidth,
    plotHeight,
    topnotcherMode,
    activeTargetPercent,
    topnotcherTargetPercent,
    passingTargetPercent,
    cutoffPercent,
    activeTargetLineY,
    topnotcherLineY,
    passingLineY,
    cutoffLineY,
    yTicks,
    weightedReadinessPercent,
    weightedGapToOverallPassing,
    passingSubjectsCount,
    testedSubjectsCount: testedColumns.length,
    cutoffRiskCount,
    columns,
    studyPrompts,
    strengths,
  };
}

/**
 * Builds a Section-Level Weight-by-Score Marimekko chart for a single BLEPP Subject
 * inside Performance Analytics ("More Information"), so heavy syllabus sections
 * (e.g., Abnormal Psych Section B at 50% weight, Psych Assessment Section A at 30% weight)
 * visually span their exact share of the subject.
 */
export function buildSectionMarimekkoData(
  attemptLogs: QuestionAttemptLog[],
  subjectsMeta: Record<
    SubjectId,
    Omit<SubjectSectionMeta, 'sections'> & {
      sections: {
        id: string;
        sectionLetter: string;
        title: string;
        weightPercent: number;
        competencies: { id: string; code: string; description: string }[];
      }[];
    }
  >,
  grades: SubjectGrades,
  masteredCompetencies: Record<string, boolean>,
  subjectId: SubjectId,
  options?: StrengthWeaknessAnalysisOptions
): SectionMarimekkoChartData {
  const topnotcherMode = Boolean(options?.topnotcherMode);
  const effectiveGrades = options?.ignoreManualGrades ? ZERO_SUBJECT_GRADES : grades;
  const viewBoxWidth = 760;
  const viewBoxHeight = 276;
  const plotLeft = 44;
  const plotRight = 748;
  const plotTop = 20;
  const plotBottom = 210;
  const plotWidth = plotRight - plotLeft; // 704
  const plotHeight = plotBottom - plotTop; // 190
  const passingTargetPercent = STANDARD_PASSING_TARGET_PERCENT;
  const topnotcherTargetPercent = normalizeTopnotcherThreshold(
    options?.topnotcherThreshold
  );
  const activeTargetPercent = topnotcherMode
    ? topnotcherTargetPercent
    : passingTargetPercent;
  const cutoffPercent = SUBJECT_CUTOFF_PERCENT;
  const columnGapPx = 4;

  const scoreToY = (pct: number): number => {
    const clamped = Math.min(100, Math.max(0, pct));
    return Number((plotBottom - (clamped / 100) * plotHeight).toFixed(2));
  };

  const passingLineY = scoreToY(passingTargetPercent);
  const topnotcherLineY = scoreToY(topnotcherTargetPercent);
  const activeTargetLineY = topnotcherMode ? topnotcherLineY : passingLineY;
  const cutoffLineY = scoreToY(cutoffPercent);
  const yTicks: MarimekkoAxisTick[] = buildMarimekkoYTicks(
    scoreToY,
    topnotcherMode,
    topnotcherTargetPercent
  );

  const report = analyzeStrengthsAndWeaknesses(
    attemptLogs,
    subjectsMeta,
    effectiveGrades,
    options
  );
  const subj = subjectsMeta[subjectId];
  const totalSecWeight = subj.sections.reduce((s, sec) => s + sec.weightPercent, 0);
  const usableWidth = plotWidth - columnGapPx * Math.max(0, subj.sections.length - 1);

  let cursorX = plotLeft;

  const columns: SectionMarimekkoColumn[] = subj.sections.map((sec) => {
    const topicStat = report.allTopicStats.find(
      (t) => t.subjectId === subjectId && t.sectionId === sec.id
    );
    const attempts = topicStat ? topicStat.attempts : 0;
    const correct = topicStat ? topicStat.correct : 0;
    const currentPercent = attempts > 0 && topicStat ? topicStat.accuracyPercent : 0;
    const status: MarimekkoStatus = classifyStarStatus(
      currentPercent,
      attempts > 0,
      topnotcherMode,
      topnotcherTargetPercent
    );

    const totalGoals = sec.competencies.length;
    const masteredGoals = sec.competencies.filter(
      (c) => masteredCompetencies[c.id]
    ).length;

    const width = Number(
      ((sec.weightPercent / totalSecWeight) * usableWidth).toFixed(2)
    );
    const x = Number(cursorX.toFixed(2));
    const centerX = Number((x + width / 2).toFixed(2));
    cursorX += width + columnGapPx;

    const barY = scoreToY(currentPercent);
    const barHeight = Number((plotBottom - barY).toFixed(2));
    const deficitY = currentPercent < activeTargetPercent ? activeTargetLineY : barY;
    const deficitHeight =
      currentPercent < activeTargetPercent
        ? Number((barY - activeTargetLineY).toFixed(2))
        : 0;

    const earnedSectionPoints = Number(
      ((currentPercent * sec.weightPercent) / 100).toFixed(1)
    );
    const boardImpactPercent = Number(
      ((subj.weightPercent * sec.weightPercent) / 100).toFixed(1)
    );

    const shortLabel =
      width >= 95
        ? `Sec ${sec.sectionLetter} · ${
            SUNBURST_SECTION_SHORT_LABELS[sec.id] || sec.title.slice(0, 12)
          }`
        : `Sec ${sec.sectionLetter}`;

    return {
      id: `sec_mekko_${sec.id}`,
      subjectId,
      sectionId: sec.id,
      sectionLetter: sec.sectionLetter,
      sectionTitle: sec.title,
      shortLabel,
      weightPercent: sec.weightPercent,
      boardImpactPercent,
      x,
      width,
      centerX,
      trackY: plotTop,
      trackHeight: plotHeight,
      barY,
      barHeight,
      deficitY,
      deficitHeight,
      currentPercent: Number(currentPercent.toFixed(1)),
      earnedSectionPoints,
      maxSectionPoints: sec.weightPercent,
      attempts,
      correct,
      masteredGoals,
      totalGoals,
      status,
    };
  });

  const subjectSectionWeightedScore = Number(
    columns.reduce((s, c) => s + c.earnedSectionPoints, 0).toFixed(1)
  );

  return {
    subjectId,
    subjectTitle: subj.fullTitle,
    subjectBoardWeightPercent: subj.weightPercent,
    viewBoxWidth,
    viewBoxHeight,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    plotWidth,
    plotHeight,
    topnotcherMode,
    activeTargetPercent,
    topnotcherTargetPercent,
    passingTargetPercent,
    cutoffPercent,
    activeTargetLineY,
    topnotcherLineY,
    passingLineY,
    cutoffLineY,
    yTicks,
    subjectSectionWeightedScore,
    columns,
  };
}

export interface ExamCountdownSnapshot {
  examDate: string;
  formattedDate: string;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalRemainingMs: number;
  status: 'UPCOMING' | 'EXAM_DAY' | 'PAST';
}

export interface SuggestedExamDatePreset {
  label: string;
  dateStr: string;
}

export function formatDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalExamDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function formatExamDateDisplay(dateStr: string | null | undefined): string {
  const parsed = parseLocalExamDate(dateStr);
  if (!parsed) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export function calculateExamCountdown(
  examDateStr: string | null | undefined,
  nowMs: number = Date.now()
): ExamCountdownSnapshot | null {
  const startOfDay = parseLocalExamDate(examDateStr);
  if (!startOfDay || !examDateStr) return null;

  const normalizedDate = formatDateInputValue(startOfDay);
  const formattedDate = formatExamDateDisplay(normalizedDate);
  const startMs = startOfDay.getTime();
  const endOfDayMs = new Date(
    startOfDay.getFullYear(),
    startOfDay.getMonth(),
    startOfDay.getDate(),
    23,
    59,
    59,
    999
  ).getTime();

  if (nowMs < startMs) {
    const remainingMs = startMs - nowMs;
    const totalSeconds = Math.floor(remainingMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      examDate: normalizedDate,
      formattedDate,
      days,
      hours,
      minutes,
      seconds,
      totalRemainingMs: remainingMs,
      status: 'UPCOMING',
    };
  }

  if (nowMs <= endOfDayMs) {
    return {
      examDate: normalizedDate,
      formattedDate,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalRemainingMs: 0,
      status: 'EXAM_DAY',
    };
  }

  return {
    examDate: normalizedDate,
    formattedDate,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    totalRemainingMs: 0,
    status: 'PAST',
  };
}

export function getSuggestedExamDates(
  nowMs: number = Date.now()
): SuggestedExamDatePreset[] {
  const base = new Date(nowMs);
  const todayStart = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    0,
    0,
    0,
    0
  );

  const addDays = (daysToAdd: number): string => {
    const next = new Date(todayStart);
    next.setDate(next.getDate() + daysToAdd);
    return formatDateInputValue(next);
  };

  // Official PRC BLEPP exams are commonly scheduled in late September
  let septYear = todayStart.getFullYear();
  let nextSept = new Date(septYear, 8, 24, 0, 0, 0, 0);
  if (nextSept.getTime() <= todayStart.getTime()) {
    septYear += 1;
    nextSept = new Date(septYear, 8, 24, 0, 0, 0, 0);
  }

  return [
    { label: 'In 30 Days', dateStr: addDays(30) },
    { label: 'In 90 Days', dateStr: addDays(90) },
    { label: 'In 6 Months', dateStr: addDays(180) },
    { label: `Sept ${septYear}`, dateStr: formatDateInputValue(nextSept) },
  ];
}

export const DEFAULT_DAILY_QUESTION_GOAL = 30;
export const MIN_DAILY_QUESTION_GOAL = 5;
export const MAX_DAILY_QUESTION_GOAL = 500;
export const DAILY_GOAL_PRESETS = [15, 30, 50, 100] as const;

export function normalizeDailyQuestionGoal(
  value?: number | null,
  fallback = DEFAULT_DAILY_QUESTION_GOAL
): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  const rounded = Math.round(num);
  return Math.min(MAX_DAILY_QUESTION_GOAL, Math.max(MIN_DAILY_QUESTION_GOAL, rounded));
}

/**
 * Extracts a clean first name for the homepage greeting ("Hi [First Name]")
 * from the user's custom display name, falling back to a readable email prefix or "Future RPm".
 */
export function extractFirstName(
  displayName?: string | null,
  fallbackEmail?: string | null
): string {
  const cleanedName = typeof displayName === 'string' ? displayName.trim() : '';
  if (cleanedName.length > 0) {
    const tokens = cleanedName.split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      return tokens[0];
    }
  }

  const cleanedEmail = typeof fallbackEmail === 'string' ? fallbackEmail.trim() : '';
  if (cleanedEmail && cleanedEmail.toLowerCase() !== 'preview@bleppify.app') {
    const localPart = cleanedEmail.split('@')[0] || '';
    const firstWord = localPart
      .split(/[._+-]+/)
      .map((part) => part.replace(/\d+$/g, '').trim())
      .find((part) => part.length >= 2);
    if (firstWord) {
      return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
    }
  }

  return 'Future RPm';
}

/**
 * Computes 1–2 uppercase avatar initials from display name or email.
 */
export function extractProfileInitials(
  displayName?: string | null,
  fallbackEmail?: string | null
): string {
  const cleanedName = typeof displayName === 'string' ? displayName.trim() : '';
  if (cleanedName.length > 0) {
    const parts = cleanedName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }

  const first = extractFirstName(null, fallbackEmail);
  if (first && first !== 'Future RPm') {
    return first.slice(0, 2).toUpperCase();
  }
  return 'RP';
}

export interface DailyQuestionProgress {
  answeredToday: number;
  correctToday: number;
  accuracyTodayPercent: number;
  dailyGoal: number;
  remainingToday: number;
  progressPercent: number;
  isGoalMet: boolean;
}

/**
 * Calculates how many board items the user has answered during the current local calendar day
 * against their configured daily question goal.
 */
export function calculateDailyQuestionProgress(
  attemptLogs: QuestionAttemptLog[],
  dailyGoalInput?: number | null,
  nowMs: number = Date.now()
): DailyQuestionProgress {
  const dailyGoal = normalizeDailyQuestionGoal(dailyGoalInput, DEFAULT_DAILY_QUESTION_GOAL);
  const nowDate = new Date(nowMs);
  const startOfDayMs = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
    0,
    0,
    0,
    0
  ).getTime();
  const endOfDayMs = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
    23,
    59,
    59,
    999
  ).getTime();

  const seenIds = new Set<string>();
  let answeredToday = 0;
  let correctToday = 0;

  if (Array.isArray(attemptLogs)) {
    for (const log of attemptLogs) {
      if (!log || typeof log.timestamp !== 'number') continue;
      if (log.timestamp < startOfDayMs || log.timestamp > endOfDayMs) continue;
      const dedupeKey = log.id || `${log.questionId}_${log.timestamp}`;
      if (seenIds.has(dedupeKey)) continue;
      seenIds.add(dedupeKey);
      answeredToday++;
      if (log.isCorrect) {
        correctToday++;
      }
    }
  }

  const accuracyTodayPercent =
    answeredToday > 0 ? Number(((correctToday / answeredToday) * 100).toFixed(1)) : 0;
  const remainingToday = Math.max(0, dailyGoal - answeredToday);
  const progressPercent = Math.min(100, Math.round((answeredToday / dailyGoal) * 100));
  const isGoalMet = answeredToday >= dailyGoal;

  return {
    answeredToday,
    correctToday,
    accuracyTodayPercent,
    dailyGoal,
    remainingToday,
    progressPercent,
    isGoalMet,
  };
}

export interface AvatarCropSourceRect {
  sx: number;
  sy: number;
  sSide: number;
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_AVATAR_CROP_ZOOM = 1;
export const MAX_AVATAR_CROP_ZOOM = 6;

export interface AvatarCropBox {
  x: number;
  y: number;
  side: number;
}

export type AvatarCropResizeHandle = 'nw' | 'ne' | 'sw' | 'se';
export type AvatarCropQuickRegion = 'left' | 'center' | 'right' | 'top' | 'bottom';

export function getAvatarCropSideBounds(
  naturalWidth: number,
  naturalHeight: number
): { safeW: number; safeH: number; minSide: number; maxSide: number } {
  const safeW = Math.max(1, Number.isFinite(naturalWidth) ? naturalWidth : 1);
  const safeH = Math.max(1, Number.isFinite(naturalHeight) ? naturalHeight : 1);
  const maxSide = Math.min(safeW, safeH);
  const minSide = Math.min(
    maxSide,
    Math.max(20, maxSide / MAX_AVATAR_CROP_ZOOM)
  );
  return { safeW, safeH, minSide, maxSide };
}

export function clampAvatarCropBox(
  box: AvatarCropBox,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const { safeW, safeH, minSide, maxSide } = getAvatarCropSideBounds(
    naturalWidth,
    naturalHeight
  );
  const rawSide = Number.isFinite(box.side) ? box.side : maxSide * 0.72;
  const side = Math.min(maxSide, Math.max(minSide, rawSide));
  const rawX = Number.isFinite(box.x) ? box.x : (safeW - side) / 2;
  const rawY = Number.isFinite(box.y) ? box.y : (safeH - side) / 2;
  const x = Math.min(Math.max(0, safeW - side), Math.max(0, rawX));
  const y = Math.min(Math.max(0, safeH - side), Math.max(0, rawY));
  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    side: Number(side.toFixed(2)),
  };
}

/**
 * Starts with a 72% square crop window so both horizontal and vertical dragging/positioning
 * work immediately on portrait, landscape, AND 1:1 square photos without locking any axis to center.
 */
export function createInitialAvatarCropBox(
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const { safeW, safeH, minSide, maxSide } = getAvatarCropSideBounds(
    naturalWidth,
    naturalHeight
  );
  const side = Math.min(maxSide, Math.max(minSide, maxSide * 0.72));
  return clampAvatarCropBox(
    {
      x: (safeW - side) / 2,
      y: (safeH - side) / 2,
      side,
    },
    safeW,
    safeH
  );
}

export function moveAvatarCropBox(
  box: AvatarCropBox,
  deltaImgX: number,
  deltaImgY: number,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  return clampAvatarCropBox(
    {
      x: box.x + (Number.isFinite(deltaImgX) ? deltaImgX : 0),
      y: box.y + (Number.isFinite(deltaImgY) ? deltaImgY : 0),
      side: box.side,
    },
    naturalWidth,
    naturalHeight
  );
}

export function centerAvatarCropBoxAtPoint(
  box: AvatarCropBox,
  targetImgX: number,
  targetImgY: number,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const { safeW, safeH, minSide, maxSide } = getAvatarCropSideBounds(
    naturalWidth,
    naturalHeight
  );
  // If user previously zoomed all the way out to 1.0x (locking an axis) and clicks off-center,
  // automatically tighten side to 72% so the crop box actually moves to their clicked spot.
  const axisLocked = safeW - box.side < 1 || safeH - box.side < 1;
  const effectiveSide = axisLocked
    ? Math.min(maxSide, Math.max(minSide, maxSide * 0.72))
    : box.side;
  return clampAvatarCropBox(
    {
      x: targetImgX - effectiveSide / 2,
      y: targetImgY - effectiveSide / 2,
      side: effectiveSide,
    },
    safeW,
    safeH
  );
}

export function resizeAvatarCropBoxFromHandle(
  startBox: AvatarCropBox,
  handle: AvatarCropResizeHandle,
  currentImgX: number,
  currentImgY: number,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const { safeW, safeH, minSide, maxSide } = getAvatarCropSideBounds(
    naturalWidth,
    naturalHeight
  );

  if (handle === 'se') {
    const ax = startBox.x;
    const ay = startBox.y;
    const maxAvail = Math.max(1, Math.min(maxSide, safeW - ax, safeH - ay));
    const rawSide = Math.max(currentImgX - ax, currentImgY - ay);
    const side = Math.min(maxAvail, Math.max(Math.min(minSide, maxAvail), rawSide));
    return clampAvatarCropBox({ x: ax, y: ay, side }, safeW, safeH);
  }

  if (handle === 'nw') {
    const ax = startBox.x + startBox.side;
    const ay = startBox.y + startBox.side;
    const maxAvail = Math.max(1, Math.min(maxSide, ax, ay));
    const rawSide = Math.max(ax - currentImgX, ay - currentImgY);
    const side = Math.min(maxAvail, Math.max(Math.min(minSide, maxAvail), rawSide));
    return clampAvatarCropBox({ x: ax - side, y: ay - side, side }, safeW, safeH);
  }

  if (handle === 'ne') {
    const ax = startBox.x;
    const ay = startBox.y + startBox.side;
    const maxAvail = Math.max(1, Math.min(maxSide, safeW - ax, ay));
    const rawSide = Math.max(currentImgX - ax, ay - currentImgY);
    const side = Math.min(maxAvail, Math.max(Math.min(minSide, maxAvail), rawSide));
    return clampAvatarCropBox({ x: ax, y: ay - side, side }, safeW, safeH);
  }

  // 'sw'
  const ax = startBox.x + startBox.side;
  const ay = startBox.y;
  const maxAvail = Math.max(1, Math.min(maxSide, ax, safeH - ay));
  const rawSide = Math.max(ax - currentImgX, currentImgY - ay);
  const side = Math.min(maxAvail, Math.max(Math.min(minSide, maxAvail), rawSide));
  return clampAvatarCropBox({ x: ax - side, y: ay, side }, safeW, safeH);
}

/**
 * Builds a square crop box directly from a user's marquee drag (press at anchorImgX/Y, drag to currentImgX/Y),
 * keeping the starting corner anchored so dragging across a face/corner never snaps to the center of the photo.
 */
export function createAvatarCropBoxFromMarquee(
  anchorImgX: number,
  anchorImgY: number,
  currentImgX: number,
  currentImgY: number,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const { safeW, safeH, minSide, maxSide } = getAvatarCropSideBounds(
    naturalWidth,
    naturalHeight
  );
  const ax = Math.min(safeW, Math.max(0, anchorImgX));
  const ay = Math.min(safeH, Math.max(0, anchorImgY));
  const dirX = currentImgX >= ax ? 1 : -1;
  const dirY = currentImgY >= ay ? 1 : -1;
  const maxAvailX = dirX > 0 ? safeW - ax : ax;
  const maxAvailY = dirY > 0 ? safeH - ay : ay;
  const maxAvail = Math.max(1, Math.min(maxSide, maxAvailX, maxAvailY));
  const rawSide = Math.max(
    Math.abs(currentImgX - ax),
    Math.abs(currentImgY - ay)
  );
  const side = Math.min(maxAvail, Math.max(Math.min(minSide, maxAvail), rawSide));
  const x = dirX > 0 ? ax : ax - side;
  const y = dirY > 0 ? ay : ay - side;
  return clampAvatarCropBox({ x, y, side }, safeW, safeH);
}

/**
 * Zooms the crop box while keeping its current focal center (cx, cy) anchored,
 * never resetting an off-center selection back to the center of the image.
 */
export function zoomAvatarCropBoxAroundCenter(
  box: AvatarCropBox,
  nextZoom: number,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const { safeW, safeH, maxSide } = getAvatarCropSideBounds(
    naturalWidth,
    naturalHeight
  );
  const clampedZoom = Math.min(
    MAX_AVATAR_CROP_ZOOM,
    Math.max(MIN_AVATAR_CROP_ZOOM, Number.isFinite(nextZoom) ? nextZoom : 1)
  );
  const cx = box.x + box.side / 2;
  const cy = box.y + box.side / 2;
  const nextSide = maxSide / clampedZoom;
  return clampAvatarCropBox(
    {
      x: cx - nextSide / 2,
      y: cy - nextSide / 2,
      side: nextSide,
    },
    safeW,
    safeH
  );
}

export function alignAvatarCropBoxToRegion(
  box: AvatarCropBox,
  region: AvatarCropQuickRegion,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const { safeW, safeH, minSide, maxSide } = getAvatarCropSideBounds(
    naturalWidth,
    naturalHeight
  );

  let side = box.side;
  if (
    (region === 'left' || region === 'right') &&
    safeW - side < 1
  ) {
    side = Math.min(maxSide, Math.max(minSide, maxSide * 0.68));
  } else if (
    (region === 'top' || region === 'bottom') &&
    safeH - side < 1
  ) {
    side = Math.min(maxSide, Math.max(minSide, maxSide * 0.68));
  }

  let x = box.x;
  let y = box.y;
  if (region === 'left') {
    x = 0;
  } else if (region === 'right') {
    x = safeW - side;
  } else if (region === 'top') {
    y = 0;
  } else if (region === 'bottom') {
    y = safeH - side;
  } else {
    x = (safeW - side) / 2;
    y = (safeH - side) / 2;
  }

  return clampAvatarCropBox({ x, y, side }, safeW, safeH);
}

/**
 * Computes the exact square source rectangle (sx, sy, sSide) inside an image of
 * naturalWidth x naturalHeight for a square/circular avatar cropper at zoom in [1, 6]
 * and normalized crop selection offsets panX, panY in [-1, 1]:
 * - panX = -1 selects the leftmost section (sx = 0)
 * - panX =  0 selects the horizontal center (sx = (naturalWidth - sSide) / 2)
 * - panX = +1 selects the rightmost section (sx = naturalWidth - sSide)
 * - panY = -1 selects the topmost section (sy = 0)
 * - panY =  0 selects the vertical center (sy = (naturalHeight - sSide) / 2)
 * - panY = +1 selects the bottommost section (sy = naturalHeight - sSide)
 */
export function computeAvatarCropSourceRect(
  naturalWidth: number,
  naturalHeight: number,
  zoomInput: number = 1,
  panXInput: number = 0,
  panYInput: number = 0
): AvatarCropSourceRect {
  const safeW = Math.max(1, Number.isFinite(naturalWidth) ? naturalWidth : 1);
  const safeH = Math.max(1, Number.isFinite(naturalHeight) ? naturalHeight : 1);
  const zoom = Math.min(
    MAX_AVATAR_CROP_ZOOM,
    Math.max(MIN_AVATAR_CROP_ZOOM, Number.isFinite(zoomInput) ? zoomInput : 1)
  );
  const panX = Math.min(1, Math.max(-1, Number.isFinite(panXInput) ? panXInput : 0));
  const panY = Math.min(1, Math.max(-1, Number.isFinite(panYInput) ? panYInput : 0));

  const minDim = Math.min(safeW, safeH);
  const sSide = Math.max(1, minDim / zoom);
  const maxSourcePanX = Math.max(0, (safeW - sSide) / 2);
  const maxSourcePanY = Math.max(0, (safeH - sSide) / 2);

  const sx = Math.min(
    safeW - sSide,
    Math.max(0, maxSourcePanX * (1 + panX))
  );
  const sy = Math.min(
    safeH - sSide,
    Math.max(0, maxSourcePanY * (1 + panY))
  );

  return {
    sx: Number(sx.toFixed(2)),
    sy: Number(sy.toFixed(2)),
    sSide: Number(sSide.toFixed(2)),
    zoom: Number(zoom.toFixed(3)),
    panX: Number(panX.toFixed(4)),
    panY: Number(panY.toFixed(4)),
  };
}

/**
 * Converts a target focal point (targetCenterX, targetCenterY) in natural image coordinates
 * [0..naturalWidth, 0..naturalHeight] into normalized crop offsets panX, panY in [-1, 1]
 * so clicking or dragging to any spot on the full photo centers the crop window there.
 */
export function computeCropPanFromImagePoint(
  naturalWidth: number,
  naturalHeight: number,
  zoomInput: number,
  targetCenterX: number,
  targetCenterY: number
): { panX: number; panY: number } {
  const safeW = Math.max(1, Number.isFinite(naturalWidth) ? naturalWidth : 1);
  const safeH = Math.max(1, Number.isFinite(naturalHeight) ? naturalHeight : 1);
  const zoom = Math.min(
    MAX_AVATAR_CROP_ZOOM,
    Math.max(MIN_AVATAR_CROP_ZOOM, Number.isFinite(zoomInput) ? zoomInput : 1)
  );

  const minDim = Math.min(safeW, safeH);
  const sSide = Math.max(1, minDim / zoom);
  const maxSourcePanX = Math.max(0, (safeW - sSide) / 2);
  const maxSourcePanY = Math.max(0, (safeH - sSide) / 2);

  const desiredSx = Math.min(
    safeW - sSide,
    Math.max(0, (Number.isFinite(targetCenterX) ? targetCenterX : safeW / 2) - sSide / 2)
  );
  const desiredSy = Math.min(
    safeH - sSide,
    Math.max(0, (Number.isFinite(targetCenterY) ? targetCenterY : safeH / 2) - sSide / 2)
  );

  const panX =
    maxSourcePanX > 0.0001
      ? Math.min(1, Math.max(-1, desiredSx / maxSourcePanX - 1))
      : 0;
  const panY =
    maxSourcePanY > 0.0001
      ? Math.min(1, Math.max(-1, desiredSy / maxSourcePanY - 1))
      : 0;

  return {
    panX: Number(panX.toFixed(4)),
    panY: Number(panY.toFixed(4)),
  };
}

export interface BoardMotivationalQuote {
  id: string;
  quote: string;
  author: string;
  workOrRole: string;
}

export const BLEPP_MOTIVATIONAL_QUOTES: readonly BoardMotivationalQuote[] = [
  {
    id: 'bandura_efficacy',
    quote:
      'Self-belief does not necessarily ensure success, but self-disbelief assuredly spawns failure.',
    author: 'Albert Bandura',
    workOrRole: 'Self-Efficacy: The Exercise of Control',
  },
  {
    id: 'duckworth_grit',
    quote: 'Enthusiasm is common. Endurance is rare.',
    author: 'Angela Duckworth',
    workOrRole: 'Grit: The Power of Passion and Perseverance',
  },
  {
    id: 'james_action',
    quote: 'Act as if what you do makes a difference. It does.',
    author: 'William James',
    workOrRole: 'Father of American Psychology',
  },
  {
    id: 'dweck_becoming',
    quote:
      'Why waste time proving over and over how great you are, when you could be getting better?',
    author: 'Carol S. Dweck',
    workOrRole: 'Mindset: The New Psychology of Success',
  },
  {
    id: 'frankl_meaning',
    quote:
      'When we are no longer able to change a situation, we are challenged to change ourselves.',
    author: 'Viktor E. Frankl',
    workOrRole: "Man's Search for Meaning",
  },
  {
    id: 'rogers_growth',
    quote:
      'The good life is a process, not a state of being. It is a direction, not a destination.',
    author: 'Carl R. Rogers',
    workOrRole: 'On Becoming a Person',
  },
  {
    id: 'epictetus_discipline',
    quote:
      'First say to yourself what you would be; and then do what you have to do.',
    author: 'Epictetus',
    workOrRole: 'Discourses',
  },
  {
    id: 'durant_habit',
    quote:
      'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
    author: 'Will Durant',
    workOrRole: 'The Story of Philosophy',
  },
];

/**
 * Selects a board-exam motivational quote deterministically for the current local calendar day,
 * plus an optional user step offset when cycling through quotes.
 */
export function getBoardMotivationalQuote(
  stepOffset: number = 0,
  nowMs: number = Date.now()
): BoardMotivationalQuote {
  const total = BLEPP_MOTIVATIONAL_QUOTES.length;
  const d = new Date(nowMs);
  const localDaySeed =
    d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  const safeOffset = Number.isFinite(stepOffset) ? Math.trunc(stepOffset) : 0;
  const idx = (((localDaySeed + safeOffset) % total) + total) % total;
  return BLEPP_MOTIVATIONAL_QUOTES[idx];
}

export const QUOTE_AUTO_ROTATE_INTERVAL_MS = 8000;

export const DEFAULT_POMODORO_STUDY_MINUTES = 25;
export const DEFAULT_POMODORO_BREAK_MINUTES = 5;

export type AutoSubjectProgressSource = 'TESTED' | 'SYLLABUS' | 'UNTESTED';

export interface AutomaticSubjectProgressRow {
  subjectId: SubjectId;
  title: string;
  weightPercent: number;
  totalBoardItems: number;
  attempts: number;
  correct: number;
  masteredGoals: number;
  totalGoals: number;
  syllabusCompletionPercent: number;
  ratingPercent: number;
  weightedContribution: number;
  targetPercent: number;
  weightedTargetContribution: number;
  weightedGapToTarget: number;
  source: AutoSubjectProgressSource;
  sourceLabel: string;
  statusLabel: string;
  statusTone: 'topnotcher' | 'passing' | 'developing' | 'cutoff_risk' | 'untested';
  passedCutoff: boolean;
  meetsTarget: boolean;
}

export interface AutomaticProgressGwaResult extends GwaCalculationResult {
  topnotcherMode: boolean;
  topnotcherTargetPercent: number;
  targetPercent: number;
  hasAnyProgress: boolean;
  achievedTopnotcher: boolean;
  gapToPassing: number;
  gapToTopnotcher: number;
  targetVerdictLabel: string;
  topnotcherCoachNote: string | null;
  autoGrades: SubjectGrades;
  subjectRows: Record<SubjectId, AutomaticSubjectProgressRow>;
}

/**
 * Automatically computes per-subject ratings and overall BLEPP GWA from actual user study progress:
 * 1. Primary signal (`TESTED`): deduplicated latest accuracy (%) across Practice Quizzes and Mock Exams in `attemptLogs`.
 * 2. Secondary signal (`SYLLABUS`): if no questions have been answered yet in a subject, scales cleared syllabus
 *    competencies proportionally toward the 75% passing baseline (`(masteredGoals / totalGoals) * 75`) without touching
 *    `Weaknesses & Study Prompts`.
 * 3. `UNTESTED`: 0% when no items or syllabus competencies have been completed yet.
 * Also evaluates either the Standard Passing target (75.0%) or the editable Topnotcher threshold (default 90.0%).
 */
export function computeAutomaticProgressGwa(
  attemptLogs: QuestionAttemptLog[],
  subjectsMeta: Record<
    SubjectId,
    Omit<SubjectSectionMeta, 'sections'> & {
      totalBoardItems?: number;
      sections: {
        id: string;
        sectionLetter: string;
        title: string;
        weightPercent: number;
        competencies: { id: string; code: string; description: string }[];
      }[];
    }
  >,
  masteredCompetencies: Record<string, boolean>,
  options?: { topnotcherMode?: boolean; topnotcherThreshold?: number }
): AutomaticProgressGwaResult {
  const topnotcherMode = Boolean(options?.topnotcherMode);
  const topnotcherTargetPercent = normalizeTopnotcherThreshold(
    options?.topnotcherThreshold
  );
  const fmtTop = formatThresholdPercent(topnotcherTargetPercent);
  const targetPercent = topnotcherMode
    ? topnotcherTargetPercent
    : STANDARD_PASSING_TARGET_PERCENT;

  const latestByQuestion = new Map<string, QuestionAttemptLog>();
  for (const log of attemptLogs) {
    const existing = latestByQuestion.get(log.questionId);
    if (!existing || log.timestamp >= existing.timestamp) {
      latestByQuestion.set(log.questionId, log);
    }
  }
  const activeLogs = Array.from(latestByQuestion.values());

  const subjectIds: SubjectId[] = [
    'dev_psych',
    'psych_assessment',
    'abnormal_psych',
    'io_psych',
  ];

  const autoGrades: SubjectGrades = { ...ZERO_SUBJECT_GRADES };
  const subjectRows = {} as Record<SubjectId, AutomaticSubjectProgressRow>;
  let hasAnyProgress = false;

  for (const subjId of subjectIds) {
    const subj = subjectsMeta[subjId];
    const subjLogs = activeLogs.filter((l) => l.subjectId === subjId);
    const attempts = subjLogs.length;
    const correct = subjLogs.filter((l) => l.isCorrect).length;

    let totalGoals = 0;
    let masteredGoals = 0;
    for (const sec of subj.sections) {
      for (const comp of sec.competencies) {
        totalGoals++;
        if (masteredCompetencies[comp.id]) masteredGoals++;
      }
    }

    const syllabusCompletionPercent =
      totalGoals > 0 ? Number(((masteredGoals / totalGoals) * 100).toFixed(1)) : 0;

    let source: AutoSubjectProgressSource = 'UNTESTED';
    let ratingPercent = 0;
    let sourceLabel = 'Untested';

    if (attempts > 0) {
      source = 'TESTED';
      ratingPercent = Number(((correct / attempts) * 100).toFixed(2));
      sourceLabel = `${correct}/${attempts} items`;
      hasAnyProgress = true;
    } else if (masteredGoals > 0 && totalGoals > 0) {
      source = 'SYLLABUS';
      ratingPercent = Number(
        ((masteredGoals / totalGoals) * STANDARD_PASSING_TARGET_PERCENT).toFixed(2)
      );
      sourceLabel = `${masteredGoals}/${totalGoals} goals`;
      hasAnyProgress = true;
    }

    autoGrades[subjId] = ratingPercent;

    const weightedContribution = Number(
      (ratingPercent * SUBJECT_WEIGHTS[subjId]).toFixed(2)
    );
    const weightedTargetContribution = Number(
      (targetPercent * SUBJECT_WEIGHTS[subjId]).toFixed(2)
    );
    const weightedGapToTarget = Number(
      Math.max(0, weightedTargetContribution - weightedContribution).toFixed(2)
    );

    const passedCutoff = source !== 'UNTESTED' && ratingPercent >= SUBJECT_CUTOFF_PERCENT;
    const meetsTarget = source !== 'UNTESTED' && ratingPercent >= targetPercent;

    let statusTone: AutomaticSubjectProgressRow['statusTone'] = 'untested';
    let statusLabel = 'Untested';

    if (source === 'UNTESTED') {
      statusTone = 'untested';
      statusLabel = 'Untested';
    } else if (ratingPercent < SUBJECT_CUTOFF_PERCENT) {
      statusTone = 'cutoff_risk';
      statusLabel = 'Below 50% Cutoff';
    } else if (topnotcherMode) {
      if (ratingPercent >= topnotcherTargetPercent) {
        statusTone = 'topnotcher';
        statusLabel = `Topnotcher (≥${fmtTop}%)`;
      } else if (ratingPercent >= STANDARD_PASSING_TARGET_PERCENT) {
        statusTone = 'developing';
        statusLabel = `Passing · +${(topnotcherTargetPercent - ratingPercent).toFixed(
          1
        )}% to ${fmtTop}%`;
      } else {
        statusTone = 'developing';
        statusLabel = `Below 75% · +${(topnotcherTargetPercent - ratingPercent).toFixed(
          1
        )}% to ${fmtTop}%`;
      }
    } else {
      if (ratingPercent >= STANDARD_PASSING_TARGET_PERCENT) {
        statusTone = 'passing';
        statusLabel = 'Passing (≥75%)';
      } else {
        statusTone = 'developing';
        statusLabel = `≥50% · +${(STANDARD_PASSING_TARGET_PERCENT - ratingPercent).toFixed(
          1
        )}% to 75%`;
      }
    }

    subjectRows[subjId] = {
      subjectId: subjId,
      title: subj.fullTitle,
      weightPercent: subj.weightPercent,
      totalBoardItems:
        subj.totalBoardItems ?? (subjId === 'psych_assessment' ? 130 : 100),
      attempts,
      correct,
      masteredGoals,
      totalGoals,
      syllabusCompletionPercent,
      ratingPercent,
      weightedContribution,
      targetPercent,
      weightedTargetContribution,
      weightedGapToTarget,
      source,
      sourceLabel,
      statusLabel,
      statusTone,
      passedCutoff,
      meetsTarget,
    };
  }

  const baseGwa = calculateBleppGwa(autoGrades);
  const achievedTopnotcher =
    baseGwa.gwa >= topnotcherTargetPercent && !baseGwa.hasDisqualifyingSubject;
  const gapToPassing = Number(
    Math.max(0, STANDARD_PASSING_TARGET_PERCENT - baseGwa.gwa).toFixed(2)
  );
  const gapToTopnotcher = Number(
    Math.max(0, topnotcherTargetPercent - baseGwa.gwa).toFixed(2)
  );

  let targetVerdictLabel = 'Complete quizzes or syllabus';
  if (hasAnyProgress) {
    if (baseGwa.hasDisqualifyingSubject) {
      if (baseGwa.gwa >= STANDARD_PASSING_TARGET_PERCENT) {
        targetVerdictLabel = 'CONDITIONAL / SUB-50% CUTOFF';
      } else if (topnotcherMode) {
        targetVerdictLabel = `NEEDS +${gapToTopnotcher.toFixed(2)}% TO ${fmtTop}%`;
      } else {
        targetVerdictLabel = `NEEDS +${gapToPassing.toFixed(2)}% TO PASS`;
      }
    } else if (topnotcherMode) {
      if (achievedTopnotcher) {
        targetVerdictLabel = `TOPNOTCHER TRACK (≥${topnotcherTargetPercent.toFixed(1)}%)`;
      } else if (baseGwa.passedOverall) {
        targetVerdictLabel = `PASSING · +${gapToTopnotcher.toFixed(2)}% TO TOPNOTCHER`;
      } else {
        targetVerdictLabel = `NEEDS +${gapToTopnotcher.toFixed(2)}% TO TOPNOTCHER`;
      }
    } else {
      if (baseGwa.passedOverall) {
        targetVerdictLabel = 'PASSED (≥75.0%)';
      } else {
        targetVerdictLabel = `NEEDS +${gapToPassing.toFixed(2)}% TO PASS`;
      }
    }
  }

  return {
    ...baseGwa,
    topnotcherMode,
    topnotcherTargetPercent,
    targetPercent,
    hasAnyProgress,
    achievedTopnotcher,
    gapToPassing,
    gapToTopnotcher,
    targetVerdictLabel,
    topnotcherCoachNote: null,
    autoGrades,
    subjectRows,
  };
}



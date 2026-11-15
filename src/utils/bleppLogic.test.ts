import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBleppGwa,
  getDifficultyFromBlooms,
  buildPrc150SheetColumns,
  gradePrcAnswerSheet,
  formatExamTimer,
  analyzeStrengthsAndWeaknesses,
  buildAdaptiveExamTip,
} from './bleppLogic';

test('calculateBleppGwa computes weighted average (20% Dev, 40% Assess, 20% Abn, 20% IO) and enforces 75% pass + 50% cutoff', () => {
  const passing = calculateBleppGwa({
    dev_psych: 78,
    psych_assessment: 80,
    abnormal_psych: 74,
    io_psych: 75,
  });
  // 78*0.2 (15.6) + 80*0.4 (32.0) + 74*0.2 (14.8) + 75*0.2 (15.0) = 77.4
  assert.equal(passing.gwa, 77.4);
  assert.equal(passing.passedOverall, true);
  assert.equal(passing.hasDisqualifyingSubject, false);
  assert.equal(passing.finalVerdict, 'PASSED');

  // High GWA but one subject below 50% cutoff
  const sub50 = calculateBleppGwa({
    dev_psych: 48,
    psych_assessment: 90,
    abnormal_psych: 85,
    io_psych: 85,
  });
  // 48*0.2 (9.6) + 90*0.4 (36) + 85*0.2 (17) + 85*0.2 (17) = 79.6
  assert.equal(sub50.gwa, 79.6);
  assert.equal(sub50.passedOverall, false);
  assert.equal(sub50.hasDisqualifyingSubject, true);
  assert.deepEqual(sub50.disqualifiedSubjects, ['dev_psych']);
  assert.equal(sub50.finalVerdict, 'CONDITIONAL / FAILED (SUB-50 CUTOFF)');
});

test('buildPrc150SheetColumns generates 6 continuous columns of 25 items each (1 to 150)', () => {
  const cols = buildPrc150SheetColumns();
  assert.equal(cols.length, 6);
  assert.equal(cols[0].startItem, 1);
  assert.equal(cols[0].endItem, 25);
  assert.equal(cols[0].items.length, 25);
  assert.equal(cols[3].startItem, 76);
  assert.equal(cols[3].endItem, 100);
  assert.equal(cols[4].startItem, 101);
  assert.equal(cols[4].endItem, 125);
  assert.equal(cols[5].startItem, 126);
  assert.equal(cols[5].endItem, 150);
});

test('gradePrcAnswerSheet grades only active items, penalizes MULTIPLE_SHADED and BLANK, and detects over-shading past exam length', () => {
  const key = [
    { itemNumber: 1, correctChoice: 'A' as const, sectionCode: 'A', bloomsLevel: 'Remembering' as const },
    { itemNumber: 2, correctChoice: 'B' as const, sectionCode: 'A', bloomsLevel: 'Applying' as const },
    { itemNumber: 3, correctChoice: 'C' as const, sectionCode: 'B', bloomsLevel: 'Analyzing' as const },
    { itemNumber: 4, correctChoice: 'D' as const, sectionCode: 'B', bloomsLevel: 'Evaluating' as const },
  ];

  const shaded: Record<number, 'A' | 'B' | 'C' | 'D' | 'E' | 'BLANK' | 'MULTIPLE_SHADED'> = {
    1: 'A', // correct
    2: 'C', // wrong
    3: 'MULTIPLE_SHADED', // invalid
    4: 'BLANK', // blank
    131: 'B', // accidental mark in unused row
  };

  const result = gradePrcAnswerSheet(key, shaded);
  assert.equal(result.totalExamItems, 4);
  assert.equal(result.correctCount, 1);
  assert.equal(result.incorrectCount, 1);
  assert.equal(result.invalidOrMultipleCount, 1);
  assert.equal(result.blankCount, 1);
  assert.equal(result.percentage, 25);
  assert.deepEqual(result.overShadedItems, [131]);
});

test('getDifficultyFromBlooms and formatExamTimer behave deterministically', () => {
  assert.equal(getDifficultyFromBlooms('Remembering'), 'Easy');
  assert.equal(getDifficultyFromBlooms('Applying'), 'Moderate');
  assert.equal(getDifficultyFromBlooms('Evaluating'), 'Difficult');
  assert.equal(formatExamTimer(10800), '03:00:00');
  assert.equal(formatExamTimer(1799), '00:29:59');
});

test('analyzeStrengthsAndWeaknesses classifies strengths (>=75%), developing (60-74.9%), and weaknesses (<60%)', () => {
  const meta = {
    dev_psych: {
      id: 'dev_psych' as const,
      fullTitle: 'Developmental Psychology',
      weightPercent: 20,
      sections: [
        { id: 'dev_A', sectionLetter: 'A', title: 'Nature & Nurture', weightPercent: 5 },
        { id: 'dev_B', sectionLetter: 'B', title: 'Research Methods', weightPercent: 5 },
      ],
    },
    psych_assessment: {
      id: 'psych_assessment' as const,
      fullTitle: 'Psychological Assessment',
      weightPercent: 40,
      sections: [
        { id: 'pa_A', sectionLetter: 'A', title: 'Psychometric Properties', weightPercent: 30 },
      ],
    },
    abnormal_psych: {
      id: 'abnormal_psych' as const,
      fullTitle: 'Abnormal Psychology',
      weightPercent: 20,
      sections: [
        { id: 'abn_A', sectionLetter: 'A', title: 'Normalcy & Abnormalcy', weightPercent: 10 },
      ],
    },
    io_psych: {
      id: 'io_psych' as const,
      fullTitle: 'Industrial-Organizational Psychology',
      weightPercent: 20,
      sections: [
        { id: 'io_A', sectionLetter: 'A', title: 'Org Theory', weightPercent: 15 },
      ],
    },
  };

  const report = analyzeStrengthsAndWeaknesses(
    [
      {
        id: '1',
        questionId: 'q1',
        subjectId: 'dev_psych',
        sectionCode: 'A',
        tosCode: 'A · 1.1',
        bloomsLevel: 'Understanding',
        selectedChoice: 'A',
        correctChoice: 'A',
        isCorrect: true,
        timestamp: 100,
        mode: 'practice',
      },
      {
        id: '2',
        questionId: 'q2',
        subjectId: 'psych_assessment',
        sectionCode: 'A',
        tosCode: 'A · 1.1',
        bloomsLevel: 'Analyzing',
        selectedChoice: 'B',
        correctChoice: 'A',
        isCorrect: false,
        timestamp: 200,
        mode: 'practice',
      },
    ],
    meta,
    { dev_psych: 0, psych_assessment: 0, abnormal_psych: 0, io_psych: 0 }
  );

  assert.equal(report.totalAttempts, 2);
  assert.equal(report.overallAccuracyPercent, 50);
  assert.equal(report.strengths.length, 1);
  assert.equal(report.strengths[0].key, 'dev_psych_A');
  assert.equal(report.weaknesses.length, 1);
  assert.equal(report.weaknesses[0].key, 'psych_assessment_A');
  assert.equal(report.strongestSubject?.subjectId, 'dev_psych');
  assert.equal(report.weakestSubject?.subjectId, 'psych_assessment');

  const onlyWeakReport = analyzeStrengthsAndWeaknesses(
    [
      {
        id: '2',
        questionId: 'q2',
        subjectId: 'psych_assessment',
        sectionCode: 'A',
        tosCode: 'A · 1.1',
        bloomsLevel: 'Analyzing',
        selectedChoice: 'B',
        correctChoice: 'A',
        isCorrect: false,
        timestamp: 200,
        mode: 'practice',
      },
    ],
    meta,
    { dev_psych: 0, psych_assessment: 0, abnormal_psych: 0, io_psych: 0 }
  );
  assert.equal(onlyWeakReport.strongestSubject, null);
  assert.equal(onlyWeakReport.weakestSubject?.subjectId, 'psych_assessment');
});

test('buildAdaptiveExamTip provides context-based best-answer expansion without repetitive Bonus Takeaway boilerplate and clears distractor misconceptions', () => {
  const sampleQ = {
    options: {
      A: 'Identity Moratorium',
      B: 'Identity Foreclosure',
      C: 'Identity Diffusion',
      D: 'Identity Achievement',
    },
    correctChoice: 'B' as const,
    tosCode: 'Section C · 1.8 Marcia Identity Formation',
    bloomsLevel: 'Applying' as const,
    rationale: 'Foreclosure involves high commitment without crisis.',
    optionRationales: {
      A: 'Moratorium involves active exploration without commitment, unlike Jomar who already settled on Accountancy.',
      B: 'Foreclosure involves commitment adopted from parents without prior exploration.',
      C: 'Diffusion lacks both exploration and commitment.',
      D: 'Achievement involves both exploration and commitment.',
    },
    examTip: 'Combine zero exploration with firm parental commitment in the stem.',
    adaptiveTips: {
      correctTip:
        'Identity Foreclosure is the best fit because Jomar already committed to Accountancy while never exploring alternatives—ruling out partial matches like Achievement (requires exploration) and Diffusion (lacks commitment). Bonus Takeaway: Watch for timeframe, age, or PAP ethical qualifiers that flip look-alike choices.',
      misconceptionTips: {
        A: 'Moratorium requires active exploration without commitment, whereas the stem states Jomar never explored other programs and already settled on Accountancy.',
      },
    },
  };

  const rightTip = buildAdaptiveExamTip(sampleQ, 'B');
  assert.equal(rightTip.variant, 'correct');
  assert.ok(rightTip.headline.includes('BLEPP Mastery Tip'));
  assert.ok(rightTip.headline.includes('Why [B] Is the Best Fit'));
  assert.equal(rightTip.body.includes('Bonus Takeaway'), false);
  assert.ok(rightTip.body.includes('Identity Foreclosure is the best fit'));

  const wrongTip = buildAdaptiveExamTip(sampleQ, 'A');
  assert.equal(wrongTip.variant, 'misconception');
  assert.ok(wrongTip.headline.includes('Why [A] ("Identity Moratorium") Is Not the Best Fit Here'));
  assert.ok(wrongTip.body.includes('Moratorium requires active exploration'));
  assert.equal(wrongTip.body.includes('Bonus Takeaway'), false);

  const fallbackRight = buildAdaptiveExamTip(
    { ...sampleQ, adaptiveTips: undefined, examTip: undefined },
    'B'
  );
  assert.equal(fallbackRight.body.includes('Bonus Takeaway'), false);
  assert.ok(fallbackRight.body.includes('best answer'));

  const fallbackWrong = buildAdaptiveExamTip(
    { ...sampleQ, adaptiveTips: undefined, examTip: undefined },
    'A'
  );
  assert.equal(fallbackWrong.body.includes('Section C'), false);
  assert.equal(fallbackWrong.body.includes('1.8'), false);
});

test('getQuestionOptionRationales and getAdaptiveQuestionExamTip provide context-grounded explanations across all PRC seed questions and upgrade saved stubs', async () => {
  const {
    PRC_TOS_SUBJECTS,
    getQuestionOptionRationales,
    getAdaptiveQuestionExamTip,
  } = await import('../data/tosData');

  for (const subj of Object.values(PRC_TOS_SUBJECTS)) {
    for (const sq of subj.seedQuestions) {
      const rationales = getQuestionOptionRationales(sq);
      for (const letter of ['A', 'B', 'C', 'D'] as const) {
        assert.ok(rationales[letter].length > 30, `${sq.id} [${letter}] rationale too short`);
        assert.equal(
          rationales[letter].includes('is a look-alike distractor that does not satisfy'),
          false
        );
        assert.equal(/Section [A-F]\b/.test(rationales[letter]), false);
      }

      const rightTip = getAdaptiveQuestionExamTip(sq, sq.correctChoice);
      assert.equal(rightTip.body.includes('Bonus Takeaway'), false);
      assert.equal(/Section [A-F]\b/.test(rightTip.body), false);
    }
  }

  // Saved legacy stub for dev_q_1 (missing optionRationales & adaptiveTips) upgrades automatically
  const savedLegacyStub = {
    id: 'dev_q_1',
    stem: PRC_TOS_SUBJECTS.dev_psych.seedQuestions[0].stem,
    options: PRC_TOS_SUBJECTS.dev_psych.seedQuestions[0].options,
    correctChoice: 'B' as const,
    sectionCode: 'C',
    tosCode: 'Section C · 1.8',
    bloomsLevel: 'Applying' as const,
    rationale: 'Foreclosure has commitment without exploration.',
  };
  const upgradedRationales = getQuestionOptionRationales(savedLegacyStub);
  assert.ok(upgradedRationales.A.includes('Jomar'));
  const upgradedTip = getAdaptiveQuestionExamTip(savedLegacyStub, 'B');
  assert.ok(upgradedTip.body.includes('Jomar'));
  assert.equal(upgradedTip.body.includes('Bonus Takeaway'), false);
});

test('findResumableSessions detects unfinished practice quizzes and mock exams, computes nextItemNumber, and ignores completed quizzes', async () => {
  const { createEmptySubjectSession, findResumableSessions } = await import('./bleppLogic');

  const meta = {
    dev_psych: {
      id: 'dev_psych' as const,
      shortTitle: 'Dev Psych',
      fullTitle: 'Developmental Psychology',
      totalBoardItems: 100,
      examDurationMinutes: 180,
      sections: [{ id: 'dev_A', sectionLetter: 'A' }],
    },
    psych_assessment: {
      id: 'psych_assessment' as const,
      shortTitle: 'Psych Assessment',
      fullTitle: 'Psychological Assessment',
      totalBoardItems: 130,
      examDurationMinutes: 180,
      sections: [{ id: 'pa_A', sectionLetter: 'A' }],
    },
    abnormal_psych: {
      id: 'abnormal_psych' as const,
      shortTitle: 'Abnormal Psych',
      fullTitle: 'Abnormal Psychology',
      totalBoardItems: 100,
      examDurationMinutes: 180,
      sections: [{ id: 'abn_A', sectionLetter: 'A' }],
    },
    io_psych: {
      id: 'io_psych' as const,
      shortTitle: 'I/O Psych',
      fullTitle: 'Industrial-Organizational Psychology',
      totalBoardItems: 100,
      examDurationMinutes: 180,
      sections: [{ id: 'io_A', sectionLetter: 'A' }],
    },
  };

  const devSession = createEmptySubjectSession(180);
  devSession.practice.submittedAnswers = { q1: 'B' };
  devSession.practice.draftChoices = { q1: 'B', q2: 'C' };
  devSession.practice.updatedAt = 1000;

  const paSession = createEmptySubjectSession(180);
  paSession.mock.shadedMap = { 1: 'A', 2: 'D' };
  paSession.mock.examSecondsLeft = 10500;
  paSession.mock.updatedAt = 2000;

  const sessions = findResumableSessions(
    { dev_psych: devSession, psych_assessment: paSession },
    {
      dev_psych: [
        { id: 'q1', sectionCode: 'A' },
        { id: 'q2', sectionCode: 'A' },
        { id: 'q3', sectionCode: 'A' },
      ],
      psych_assessment: [
        { id: 'pa1', sectionCode: 'A' },
        { id: 'pa2', sectionCode: 'A' },
        { id: 'pa3', sectionCode: 'A' },
      ],
      abnormal_psych: [],
      io_psych: [],
    },
    meta
  );

  assert.equal(sessions.length, 2);
  // Most recently updated first (paSession mock at t=2000, then devSession practice at t=1000)
  assert.equal(sessions[0].subjectId, 'psych_assessment');
  assert.equal(sessions[0].mode, 'mock');
  assert.equal(sessions[0].completedCount, 2);
  assert.equal(sessions[0].nextItemNumber, 3);

  assert.equal(sessions[1].subjectId, 'dev_psych');
  assert.equal(sessions[1].mode, 'practice');
  assert.equal(sessions[1].completedCount, 1);
  assert.equal(sessions[1].nextItemNumber, 2);

  // Once all 3 Dev Psych questions are submitted, it is no longer flagged as unfinished
  devSession.practice.submittedAnswers = { q1: 'B', q2: 'C', q3: 'A' };
  const afterFinish = findResumableSessions(
    { dev_psych: devSession, psych_assessment: paSession },
    {
      dev_psych: [
        { id: 'q1', sectionCode: 'A' },
        { id: 'q2', sectionCode: 'A' },
        { id: 'q3', sectionCode: 'A' },
      ],
      psych_assessment: [
        { id: 'pa1', sectionCode: 'A' },
        { id: 'pa2', sectionCode: 'A' },
        { id: 'pa3', sectionCode: 'A' },
      ],
      abnormal_psych: [],
      io_psych: [],
    },
    meta
  );
  assert.equal(afterFinish.length, 1);
  assert.equal(afterFinish[0].subjectId, 'psych_assessment');

  // Explicitly saved/completed partial quiz (completedAt > 0) is also excluded from unfinished banner
  devSession.practice.submittedAnswers = { q1: 'B' };
  devSession.practice.completedAt = 5000;
  const afterExplicitSave = findResumableSessions(
    { dev_psych: devSession },
    {
      dev_psych: [
        { id: 'q1', sectionCode: 'A' },
        { id: 'q2', sectionCode: 'A' },
      ],
      psych_assessment: [],
      abnormal_psych: [],
      io_psych: [],
    },
    meta
  );
  assert.equal(afterExplicitSave.length, 0);
});

test('filterQuestionsStrictByScope strictly isolates Section A quiz from Section B and C items and normalizes section labels', async () => {
  const { filterQuestionsStrictByScope, normalizeSectionLetter } = await import('./bleppLogic');

  assert.equal(normalizeSectionLetter('A'), 'A');
  assert.equal(normalizeSectionLetter('Section A'), 'A');
  assert.equal(normalizeSectionLetter('Sec B · 2.1'), 'B');
  assert.equal(normalizeSectionLetter('dev_C'), 'C');

  const mixedQuestions = [
    { id: 'qA1', sectionCode: 'A' },
    { id: 'qA2', sectionCode: 'Section A' },
    { id: 'qB1', sectionCode: 'B' },
    { id: 'qC1', sectionCode: 'C' },
  ];
  const sections = [
    { id: 'dev_A', sectionLetter: 'A' },
    { id: 'dev_B', sectionLetter: 'B' },
    { id: 'dev_C', sectionLetter: 'C' },
  ];

  const onlySecA = filterQuestionsStrictByScope(mixedQuestions, 'dev_A', sections);
  assert.deepEqual(
    onlySecA.map((q) => q.id),
    ['qA1', 'qA2']
  );

  // Even when 0 items match Section B in an active batch, never leak Section A or C items
  const emptySecB = filterQuestionsStrictByScope(
    [
      { id: 'qA1', sectionCode: 'A' },
      { id: 'qC1', sectionCode: 'C' },
    ],
    'dev_B',
    sections
  );
  assert.equal(emptySecB.length, 0);
});

test('deduplicateQuestions removes exact and near-identical repetitive stems while preserving distinct items', async () => {
  const { deduplicateQuestions } = await import('./bleppLogic');

  const existingStems = [
    'Jomar, a 19-year-old college sophomore in Manila, enrolled in Accountancy solely because both of his parents are CPAs and never explored other degree programs.',
  ];

  const incoming = [
    {
      id: 'dup_exact',
      stem: 'Jomar, a 19-year-old college sophomore in Manila, enrolled in Accountancy solely because both of his parents are CPAs and never explored other degree programs!',
    },
    {
      id: 'dup_near',
      stem: 'Jomar, a 19-year-old sophomore in Manila, enrolled in Accountancy solely because his parents are CPAs and never explored other degree programs.',
    },
    {
      id: 'fresh_1',
      stem: 'During a longitudinal infant twin study in Cebu, researchers observed that monozygotic twins reached walking milestones within days of each other despite different home toys. Which concept explains this?',
    },
    {
      id: 'dup_intra_batch',
      stem: 'During a longitudinal infant twin study in Cebu, researchers observed that monozygotic twins reached walking milestones within days of each other despite different home toys. Which concept explains this?',
    },
  ];

  const deduped = deduplicateQuestions(incoming, existingStems);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].id, 'fresh_1');
});

test('mode item counts (5 flashcards, 15 quiz, 100 mock / 180m) and auto-clearing section goals work deterministically', async () => {
  const {
    FLASHCARD_DECK_SIZE,
    PRACTICE_QUIZ_SIZE,
    MOCK_EXAM_SIZE,
    MOCK_EXAM_DURATION_MINUTES,
    buildMockExamSectionBatches,
    evaluateQuizCompletionAndSectionGoals,
  } = await import('./bleppLogic');
  const { PRC_TOS_SUBJECTS } = await import('../data/tosData');

  assert.equal(FLASHCARD_DECK_SIZE, 5);
  assert.equal(PRACTICE_QUIZ_SIZE, 15);
  assert.equal(MOCK_EXAM_SIZE, 100);
  assert.equal(MOCK_EXAM_DURATION_MINUTES, 180);

  for (const subj of Object.values(PRC_TOS_SUBJECTS)) {
    assert.equal(subj.seedFlashcards.length, 5, `${subj.id} should have 5 seed flashcards`);
    const batches = buildMockExamSectionBatches(subj.sections, 100, 25);
    const sum = batches.reduce((acc, b) => acc + b.count, 0);
    assert.equal(sum, 100, `${subj.id} mock batches must sum to 100 items`);
    assert.ok(batches.every((b) => b.count > 0 && b.count <= 25));
  }

  // Completing a 15-item Section A quiz automatically clears all competencies in Section A
  const devSecA = PRC_TOS_SUBJECTS.dev_psych.sections[0];
  const quizItems = Array.from({ length: 15 }, (_, idx) => ({
    id: `qa_${idx + 1}`,
    sectionCode: 'A',
    correctChoice: 'B' as const,
  }));
  const partialAnswers: Record<string, 'A' | 'B' | 'C' | 'D'> = { qa_1: 'B', qa_2: 'A' };
  const partialEval = evaluateQuizCompletionAndSectionGoals(
    quizItems,
    partialAnswers,
    devSecA.id,
    PRC_TOS_SUBJECTS.dev_psych.sections
  );
  assert.equal(partialEval.isAllAnswered, false);
  assert.equal(partialEval.clearedCompetencyIds.length, 0);

  const fullAnswers: Record<string, 'A' | 'B' | 'C' | 'D'> = {};
  quizItems.forEach((q, idx) => {
    fullAnswers[q.id] = idx < 12 ? 'B' : 'A'; // 12/15 = 80%
  });
  const completedEval = evaluateQuizCompletionAndSectionGoals(
    quizItems,
    fullAnswers,
    devSecA.id,
    PRC_TOS_SUBJECTS.dev_psych.sections
  );
  assert.equal(completedEval.isAllAnswered, true);
  assert.equal(completedEval.answeredCount, 15);
  assert.equal(completedEval.correctCount, 12);
  assert.equal(completedEval.accuracyPercent, 80);
  assert.deepEqual(
    completedEval.clearedCompetencyIds,
    devSecA.competencies.map((c) => c.id)
  );
});

test('buildPracticeQuizParallelBatches partitions 15-item quiz into 3 fast non-overlapping parallel workers and streamlined schema preserves contextual tips', async () => {
  const {
    buildPracticeQuizParallelBatches,
    buildAdaptiveExamTip,
    PRACTICE_QUIZ_SIZE,
  } = await import('./bleppLogic');

  const sampleCompetencies = [
    '[1.1] Nature and nurture, heredity and environment',
    '[1.2] Continuity vs discontinuity and stability vs change',
    '[1.3] Bronfenbrenner bioecological systems',
    '[1.4] Piaget cognitive development stages',
  ].join('\n');

  const batches = buildPracticeQuizParallelBatches(
    sampleCompetencies,
    'TOS_PROPORTIONAL',
    PRACTICE_QUIZ_SIZE
  );
  assert.equal(batches.length, 4);
  // 3 + 4 + 4 + 5 = 16 (+1 buffer for single-wave deduplication, 3-item lead worker for fast first paint)
  assert.deepEqual(
    batches.map((b) => b.count),
    [3, 4, 4, 5]
  );
  assert.notEqual(batches[0].batchFocusHint, batches[1].batchFocusHint);
  assert.notEqual(batches[1].batchFocusHint, batches[2].batchFocusHint);
  assert.notEqual(batches[2].batchFocusHint, batches[3].batchFocusHint);
  assert.notEqual(batches[0].competencySubsetText, batches[1].competencySubsetText);

  // Verify streamlined question payload (no redundant adaptiveTips object) produces rich, non-boilerplate tips
  const streamlinedItem = {
    options: {
      A: 'Passive genotype-environment correlation',
      B: 'Evocative genotype-environment correlation',
      C: 'Active (niche-picking) genotype-environment correlation',
      D: 'Epigenetic canalization',
    },
    correctChoice: 'C' as const,
    tosCode: 'A · 1.1',
    bloomsLevel: 'Applying' as const,
    rationale:
      'Active niche-picking occurs when an older child independently seeks clubs matching her inherited musical aptitude.',
    optionRationales: {
      A: 'Passive correlation applies when biological parents provide both genes and the early home environment without the child choosing it, whereas 14-year-old Mara independently auditioned.',
      B: 'Evocative correlation refers to social responses elicited from others rather than Mara deliberately seeking out the school choir.',
      C: 'Active niche-picking best fits because Mara actively selected an extracurricular setting aligned with her inherited pitch sensitivity.',
      D: 'Canalization describes traits buffered against environmental variation rather than self-selection of environments.',
    },
    examTip:
      'Because 14-year-old Mara actively sought and auditioned for the choir herself rather than merely receiving a musical home from parents, Active (niche-picking) beats Passive and Evocative correlations.',
  };

  const masteryTip = buildAdaptiveExamTip(streamlinedItem, 'C');
  assert.equal(masteryTip.variant, 'correct');
  assert.equal(masteryTip.body.includes('Bonus Takeaway'), false);
  assert.equal(masteryTip.body.includes('fuller fit than partial or look-alike alternatives'), false);
  assert.ok(masteryTip.body.includes('Mara actively sought'));

  const distractorTip = buildAdaptiveExamTip(streamlinedItem, 'A');
  assert.equal(distractorTip.variant, 'misconception');
  assert.ok(distractorTip.body.includes('Passive correlation applies when biological parents'));
  assert.equal(distractorTip.body.includes('Bonus Takeaway'), false);
});

test('buildStrictSectionIsolationSpec and filterPureLockedSectionQuestions enforce gradual single-section learning and block Section E / sibling bleed in Dev Psych Section A', async () => {
  const {
    buildStrictSectionIsolationSpec,
    buildPracticeQuizParallelBatches,
    filterPureLockedSectionQuestions,
    PRACTICE_QUIZ_SIZE,
  } = await import('./bleppLogic');
  const { PRC_TOS_SUBJECTS } = await import('../data/tosData');

  const devSections = PRC_TOS_SUBJECTS.dev_psych.sections;
  const specA = buildStrictSectionIsolationSpec('dev_psych', devSections, 'dev_A');

  assert.equal(specA.isLockedSection, true);
  assert.equal(specA.lockedSectionLetter, 'A');
  assert.equal(specA.lockedSectionTitle, 'Perspectives on Nature and Nurture');
  assert.deepEqual(specA.allowedCompetencyCodes, ['1.1', '1.2', '1.3']);
  assert.ok(specA.excludedSiblingSectionsText.includes('Section B'));
  assert.ok(specA.excludedSiblingSectionsText.includes('Section C'));
  assert.ok(specA.excludedSiblingSectionsText.includes('Section D'));
  assert.ok(
    specA.excludedSiblingSectionsText.includes(
      'Section E (Developmental Issues and Tasks on Developmental Stages) [OFF-LIMITS]'
    )
  );
  assert.ok(specA.excludedSiblingSectionsText.includes('Section F'));
  assert.ok(specA.domainBoundaryNote.includes('Section E'));

  const specAll = buildStrictSectionIsolationSpec('dev_psych', devSections, 'ALL');
  assert.equal(specAll.isLockedSection, false);

  // Worker hints for Section A must NOT inject RA 11036 / PAP Code of Ethics cross-section prompts
  // and MUST assign disjoint sub-topic buckets across Workers 1..4
  const secABatches = buildPracticeQuizParallelBatches(
    specA.allowedCompetenciesText,
    'TOS_PROPORTIONAL',
    PRACTICE_QUIZ_SIZE,
    {
      subjectId: 'dev_psych',
      sectionLetter: 'A',
      sectionTitle: 'Perspectives on Nature and Nurture',
    }
  );
  assert.equal(secABatches.length, 4);
  for (const b of secABatches) {
    assert.equal(b.batchFocusHint.includes('RA 11036'), false);
    assert.equal(b.batchFocusHint.includes('PAP Code of Ethics'), false);
    assert.ok(b.batchFocusHint.includes('Section A (Perspectives on Nature and Nurture)'));
    assert.ok(b.batchFocusHint.includes('ASSIGNED SUB-TOPIC BUCKET'));
    assert.ok(b.competencySubsetText.includes('Primary Competency Spotlight'));
  }
  assert.ok(secABatches[0].batchFocusHint.includes('Genotype vs. Phenotype'));
  assert.ok(secABatches[1].batchFocusHint.includes('Twin Studies'));
  assert.ok(secABatches[2].batchFocusHint.includes('Scarr & McCartney'));
  assert.ok(secABatches[3].batchFocusHint.includes('Canalization'));

  const candidatePool = [
    {
      id: 'pure_secA_1',
      stem: 'Identical twins reared in separate provinces still display nearly identical adult height and temperament reactivity, whereas their vocabulary size reflects their adoptive parents’ reading habits. Which concept best explains how heredity sets upper and lower boundaries within which environmental enrichment operates?',
      options: {
        A: 'Reaction range (range of reaction)',
        B: 'Passive genotype-environment correlation',
        C: 'Nonshared environmental drift',
        D: 'Polygenic dominance',
      },
      correctChoice: 'A' as const,
      sectionCode: 'A',
      tosCode: '1.1',
    },
    {
      id: 'pure_secA_2',
      stem: 'Fourteen-year-old Mara inherited strong pitch sensitivity and independently auditions for her school’s chamber choir and seeks music mentors. Which heredity-environment mechanism is illustrated?',
      options: {
        A: 'Passive genotype-environment correlation',
        B: 'Evocative genotype-environment correlation',
        C: 'Active (niche-picking) genotype-environment correlation',
        D: 'Canalization',
      },
      correctChoice: 'C' as const,
      sectionCode: 'A',
      tosCode: '1.2',
    },
    {
      id: 'leaked_secE_teratogen',
      stem: 'During which prenatal stage does exposure to maternal rubella or thalidomide teratogens cause the most severe structural organ malformations?',
      options: {
        A: 'Germinal stage',
        B: 'Embryonic stage',
        C: 'Early fetal stage',
        D: 'Late fetal stage',
      },
      correctChoice: 'B' as const,
      sectionCode: 'A', // even if model mislabeled sectionCode as A!
      tosCode: '1.1',
    },
    {
      id: 'leaked_secE_tasks',
      stem: 'According to Havighurst, adjusting to decreasing physical strength, retirement, and bereavement of a spouse is an expected developmental task of:',
      options: {
        A: 'Early adulthood',
        B: 'Middle adulthood',
        C: 'Late adulthood',
        D: 'Adolescence',
      },
      correctChoice: 'C' as const,
      sectionCode: 'A',
      tosCode: '2.3',
    },
    {
      id: 'leaked_secE_unanchored_stage',
      stem: 'At age 52, Roberto feels caught between caring for his aging parents in Iloilo and funding his college-aged children’s tuition, experiencing high caregiver strain.',
      options: {
        A: 'Career consolidation',
        B: 'Emerging adulthood transition',
        C: 'Peer clique conformity',
        D: 'Midlife role overload',
      },
      correctChoice: 'D' as const,
      sectionCode: 'A',
      tosCode: '1.3',
    },
    {
      id: 'leaked_secE_honest_tag',
      stem: 'Which factor influences fetal birth weight in the third trimester?',
      options: {
        A: 'Maternal nutrition environment',
        B: 'Genetic inheritance',
        C: 'Shared upbringing',
        D: 'Maturation',
      },
      correctChoice: 'A' as const,
      sectionCode: 'E', // model honestly tagged E
      tosCode: 'Section E · 1.1',
    },
    {
      id: 'leaked_secC_piaget',
      stem: 'Four-year-old Lucas insists the tall slender glass has more juice than the short wide cup due to centration in which Piagetian stage?',
      options: {
        A: 'Sensorimotor',
        B: 'Preoperational',
        C: 'Concrete operational',
        D: 'Formal operational',
      },
      correctChoice: 'B' as const,
      sectionCode: 'A',
      tosCode: '1.3',
    },
    {
      id: 'leaked_secB_research',
      stem: 'Which study compares 20-, 40-, and 60-year-old Filipino cohorts simultaneously while controlling for cohort effects?',
      options: {
        A: 'Cross-sectional design',
        B: 'Longitudinal design',
        C: 'Sequential design',
        D: 'Case study',
      },
      correctChoice: 'C' as const,
      sectionCode: 'A',
      tosCode: '2.2',
    },
    {
      id: 'leaked_secD_direction',
      stem: 'Infants gain head and neck control before trunk and leg control, illustrating which growth principle?',
      options: {
        A: 'Cephalocaudal principle',
        B: 'Proximodistal principle',
        C: 'Maturational canalization',
        D: 'Orthogenetic differentiation',
      },
      correctChoice: 'A' as const,
      sectionCode: 'A',
      tosCode: '1.1',
    },
  ];

  const pureDevSecA = filterPureLockedSectionQuestions(candidatePool, 'dev_psych', 'A');
  assert.deepEqual(
    pureDevSecA.map((q) => q.id),
    ['pure_secA_1', 'pure_secA_2']
  );

  // Also verify cross-subject Section A guards (Psych Assessment, Abnormal Psych, I/O Psych)
  const paFiltered = filterPureLockedSectionQuestions(
    [
      {
        id: 'pa_pure',
        stem: 'A test has r_xx = 0.91 and SD = 15. What is its Standard Error of Measurement (SEM)?',
        options: { A: '4.5', B: '3.0', C: '8.82', D: '1.5' },
        correctChoice: 'A' as const,
        sectionCode: 'A',
      },
      {
        id: 'pa_ethics_leak',
        stem: 'Under the PAP Code of Ethics and RA 10029, when may raw test data be released without informed consent?',
        options: { A: 'Upon subpoena', B: 'To HR', C: 'To peers', D: 'Always' },
        correctChoice: 'A' as const,
        sectionCode: 'A',
      },
    ],
    'psych_assessment',
    'A'
  );
  assert.deepEqual(
    paFiltered.map((q) => q.id),
    ['pa_pure']
  );
});

test('buildSubjectCircularChartData computes 4 concentric subject rings for both empty and populated attempt logs', async () => {
  const { buildSubjectCircularChartData } = await import('./bleppLogic');
  const { PRC_TOS_SUBJECTS } = await import('../data/tosData');

  const emptyGrades = {
    dev_psych: 0,
    psych_assessment: 0,
    abnormal_psych: 0,
    io_psych: 0,
  };

  const firstCompId = PRC_TOS_SUBJECTS.dev_psych.sections[0].competencies[0].id;
  const fallbackSummary = buildSubjectCircularChartData(
    [],
    PRC_TOS_SUBJECTS,
    emptyGrades,
    { [firstCompId]: true }
  );

  assert.equal(fallbackSummary.rings.length, 4);
  assert.equal(fallbackSummary.centerMetricLabel, 'Goals Cleared');
  assert.equal(fallbackSummary.rings[0].subjectId, 'dev_psych');
  assert.equal(fallbackSummary.rings[0].masteredGoals, 1);
  assert.ok(fallbackSummary.rings[0].strokeDashoffset < fallbackSummary.rings[0].circumference);

  const sampleLogs = [
    {
      id: 'log_1',
      questionId: 'q_dev_1',
      subjectId: 'dev_psych' as const,
      sectionCode: 'A',
      tosCode: '1.1',
      bloomsLevel: 'Applying' as const,
      isCorrect: true,
      selectedChoice: 'A' as const,
      correctChoice: 'A' as const,
      mode: 'practice' as const,
      timestamp: 1000,
    },
    {
      id: 'log_2',
      questionId: 'q_dev_2',
      subjectId: 'dev_psych' as const,
      sectionCode: 'A',
      tosCode: '1.2',
      bloomsLevel: 'Remembering' as const,
      isCorrect: true,
      selectedChoice: 'B' as const,
      correctChoice: 'B' as const,
      mode: 'practice' as const,
      timestamp: 1001,
    },
    {
      id: 'log_3',
      questionId: 'q_abn_1',
      subjectId: 'abnormal_psych' as const,
      sectionCode: 'A',
      tosCode: '1.1',
      bloomsLevel: 'Analyzing' as const,
      isCorrect: false,
      selectedChoice: 'C' as const,
      correctChoice: 'D' as const,
      mode: 'practice' as const,
      timestamp: 1002,
    },
  ];

  const activeSummary = buildSubjectCircularChartData(
    sampleLogs,
    PRC_TOS_SUBJECTS,
    emptyGrades,
    {}
  );

  assert.equal(activeSummary.totalAttempts, 3);
  assert.equal(activeSummary.totalCorrect, 2);
  assert.equal(activeSummary.centerMetricLabel, 'Accuracy');
  assert.equal(activeSummary.centerMetricValue, '66.7%');

  const devRing = activeSummary.rings.find((r) => r.subjectId === 'dev_psych')!;
  assert.equal(devRing.accuracyPercent, 100);
  assert.equal(devRing.status, 'STRENGTH');
  assert.equal(devRing.strokeDashoffset, 0);

  const abnRing = activeSummary.rings.find((r) => r.subjectId === 'abnormal_psych')!;
  assert.equal(abnRing.accuracyPercent, 0);
  assert.equal(abnRing.status, 'WEAKNESS');
});

test('buildSubjectSunburstData builds a 3-ring stepped hierarchical sunburst with upright labels and live quiz updates', async () => {
  const { buildSubjectSunburstData } = await import('./bleppLogic');
  const { PRC_TOS_SUBJECTS } = await import('../data/tosData');

  const emptyGrades = {
    dev_psych: 0,
    psych_assessment: 0,
    abnormal_psych: 0,
    io_psych: 0,
  };

  const baseline = buildSubjectSunburstData([], PRC_TOS_SUBJECTS, emptyGrades, {});
  const ring1 = baseline.wedges.filter((w) => w.level === 1);
  const ring2 = baseline.wedges.filter((w) => w.level === 2);
  const ring3 = baseline.wedges.filter((w) => w.level === 3);

  assert.equal(ring1.length, 4);
  assert.equal(ring2.length, 23);
  // Stepped outer crown: some major sections extend into Ring 3 while compact unquizzed sections end at Ring 2
  assert.ok(ring3.length >= 10 && ring3.length < 30);

  // Ring 1 spans 0..360 exactly with Psych Assessment at 144 deg and others at 72 deg
  assert.equal(ring1[0].startDeg, 0);
  assert.equal(ring1[0].spanDeg, 144);
  assert.equal(ring1[ring1.length - 1].endDeg, 360);

  // Every wedge has minimum readable span (>= 8 deg) and upright rotation in [-90, +90]
  for (const w of baseline.wedges) {
    assert.ok(w.spanDeg >= 8, `Wedge ${w.id} span ${w.spanDeg} should be >= 8 deg`);
    assert.ok(
      w.labelRotationDeg >= -90 && w.labelRotationDeg <= 90,
      `Wedge ${w.id} label rotation ${w.labelRotationDeg} should be upright`
    );
    assert.ok(w.pathD.startsWith('M ') && w.pathD.endsWith(' Z'));
  }

  // Verify live quiz attempt updates on Dev Psych Section A protrude into Ring 3 with accuracy
  const devLogs = [
    {
      id: 's1',
      questionId: 'qd1',
      subjectId: 'dev_psych' as const,
      sectionCode: 'A',
      tosCode: '1.1',
      bloomsLevel: 'Applying' as const,
      selectedChoice: 'A' as const,
      correctChoice: 'A' as const,
      isCorrect: true,
      mode: 'practice' as const,
      timestamp: 10,
    },
    {
      id: 's2',
      questionId: 'qd2',
      subjectId: 'dev_psych' as const,
      sectionCode: 'A',
      tosCode: '1.2',
      bloomsLevel: 'Remembering' as const,
      selectedChoice: 'B' as const,
      correctChoice: 'C' as const,
      isCorrect: false,
      mode: 'practice' as const,
      timestamp: 11,
    },
  ];

  const withQuiz = buildSubjectSunburstData(devLogs, PRC_TOS_SUBJECTS, emptyGrades, {});
  assert.equal(withQuiz.centerValue, '(50%)');
  const devSecAWedge = withQuiz.wedges.find((w) => w.id === 'sec_dev_A')!;
  assert.equal(devSecAWedge.valueLabel, '(50%)');
  const devSecACrown = withQuiz.wedges.find(
    (w) => w.level === 3 && w.sectionId === 'dev_A'
  );
  assert.ok(devSecACrown, 'Quizzed Dev Psych Section A should protrude into Ring 3');
  assert.equal(devSecACrown!.valueLabel, '(1/2)');
});

test('configurable Section Quiz item counts (5..50) partition heavy sections like Abnormal Psych Section B (DSM-5) into fast <=6-item workers and clear goals at chosen target', async () => {
  const {
    QUIZ_ITEM_COUNT_OPTIONS,
    normalizeQuizItemCount,
    buildStrictSectionIsolationSpec,
    buildPracticeQuizParallelBatches,
    evaluateQuizCompletionAndSectionGoals,
  } = await import('./bleppLogic');
  const { PRC_TOS_SUBJECTS } = await import('../data/tosData');

  assert.deepEqual([...QUIZ_ITEM_COUNT_OPTIONS], [5, 10, 15, 20, 25, 30, 40, 50]);
  assert.equal(normalizeQuizItemCount(undefined), 15);
  assert.equal(normalizeQuizItemCount(1), 5);
  assert.equal(normalizeQuizItemCount(30), 30);
  assert.equal(normalizeQuizItemCount(99), 50);

  const abnSections = PRC_TOS_SUBJECTS.abnormal_psych.sections;
  const specAbnB = buildStrictSectionIsolationSpec('abnormal_psych', abnSections, 'abn_B');
  assert.equal(specAbnB.isLockedSection, true);
  assert.equal(specAbnB.lockedSectionLetter, 'B');
  assert.equal(specAbnB.allowedCompetencyCodes.length, 14);

  const abnBTitle = specAbnB.lockedSectionTitle || 'DSM-5';

  // 5-item compact quiz: 2 fast workers [2, 4]
  const batches5 = buildPracticeQuizParallelBatches(
    specAbnB.allowedCompetenciesText,
    'TOS_PROPORTIONAL',
    5,
    { subjectId: 'abnormal_psych', sectionLetter: 'B', sectionTitle: abnBTitle }
  );
  assert.deepEqual(batches5.map((b) => b.count), [2, 4]);

  // 10-item quiz: 4 fast workers [2, 2, 3, 4]
  const batches10 = buildPracticeQuizParallelBatches(
    specAbnB.allowedCompetenciesText,
    'TOS_PROPORTIONAL',
    10,
    { subjectId: 'abnormal_psych', sectionLetter: 'B', sectionTitle: abnBTitle }
  );
  assert.deepEqual(batches10.map((b) => b.count), [2, 2, 3, 4]);

  // 30-item Abnormal Psych Section B quiz: 6 fast workers (lead worker = 3, max per worker <= 6)
  // distributing all 14 DSM-5 competencies across workers with zero overlap
  const batches30 = buildPracticeQuizParallelBatches(
    specAbnB.allowedCompetenciesText,
    'TOS_PROPORTIONAL',
    30,
    { subjectId: 'abnormal_psych', sectionLetter: 'B', sectionTitle: abnBTitle }
  );
  assert.equal(batches30.length, 6);
  assert.equal(batches30[0].count, 3);
  assert.ok(batches30.every((b) => b.count <= 6));
  assert.equal(batches30.reduce((s, b) => s + b.count, 0), 32);

  const coveredLines30 = batches30
    .flatMap((b) => b.competencySubsetText.split('\n'))
    .filter((l) => l.startsWith('[1.'));
  assert.equal(coveredLines30.length, 14);
  assert.equal(new Set(coveredLines30).size, 14);

  // 50-item full PRC TOS Section B quiz: 10 fast workers (lead worker = 3, max <= 6)
  const batches50 = buildPracticeQuizParallelBatches(
    specAbnB.allowedCompetenciesText,
    'TOS_PROPORTIONAL',
    50,
    { subjectId: 'abnormal_psych', sectionLetter: 'B', sectionTitle: abnBTitle }
  );
  assert.equal(batches50.length, 10);
  assert.equal(batches50[0].count, 3);
  assert.ok(batches50.every((b) => b.count <= 6));
  assert.equal(batches50.reduce((s, b) => s + b.count, 0), 52);

  // Completing a 30-item Section B quiz clears all 14 competencies only when all 30 are answered
  const items30 = Array.from({ length: 30 }, (_, i) => ({
    id: `abn_b_${i + 1}`,
    sectionCode: 'B',
    correctChoice: 'A' as const,
  }));
  const answers15Only: Record<string, 'A' | 'B' | 'C' | 'D'> = {};
  items30.slice(0, 15).forEach((q) => {
    answers15Only[q.id] = 'A';
  });
  const midEval = evaluateQuizCompletionAndSectionGoals(items30, answers15Only, 'abn_B', abnSections);
  assert.equal(midEval.isAllAnswered, false);
  assert.equal(midEval.clearedCompetencyIds.length, 0);

  const answersAll30: Record<string, 'A' | 'B' | 'C' | 'D'> = {};
  items30.forEach((q) => {
    answersAll30[q.id] = 'A';
  });
  const doneEval = evaluateQuizCompletionAndSectionGoals(items30, answersAll30, 'abn_B', abnSections);
  assert.equal(doneEval.isAllAnswered, true);
  assert.equal(doneEval.clearedCompetencyIds.length, 14);
});

test('buildSubjectStarGraphData constructs weight-coded 5-spoke Star Graph, 75% passing polygon, section drill-down, and strength/weakness study prompts', async () => {
  const { buildSubjectStarGraphData } = await import('./bleppLogic');
  const { PRC_TOS_SUBJECTS } = await import('../data/tosData');

  const sampleLogs = [
    // Psych Assessment Section A (30% of 40% = 12% board impact): 1/4 = 25% (Cutoff Risk!)
    ...([true, false, false, false] as const).map((isCorrect, idx) => ({
      id: `pa_${idx}`,
      questionId: `q_pa_${idx}`,
      subjectId: 'psych_assessment' as const,
      sectionCode: 'A',
      tosCode: '1.1',
      bloomsLevel: 'Applying' as const,
      selectedChoice: (isCorrect ? 'A' : 'B') as 'A' | 'B',
      correctChoice: 'A' as const,
      isCorrect,
      mode: 'practice' as const,
      timestamp: 2000 + idx,
    })),
    // Dev Psych Section A: 4/5 = 80% (Strength >= 75%!)
    ...([true, true, true, true, false] as const).map((isCorrect, idx) => ({
      id: `dev_${idx}`,
      questionId: `q_dev_${idx}`,
      subjectId: 'dev_psych' as const,
      sectionCode: 'A',
      tosCode: '1.1',
      bloomsLevel: 'Remembering' as const,
      selectedChoice: (isCorrect ? 'C' : 'D') as 'C' | 'D',
      correctChoice: 'C' as const,
      isCorrect,
      mode: 'practice' as const,
      timestamp: 3000 + idx,
    })),
    // Abnormal Psych Section B (50% of 20% = 10% board impact): 3/5 = 60% (Developing)
    ...([true, true, true, false, false] as const).map((isCorrect, idx) => ({
      id: `abn_${idx}`,
      questionId: `q_abn_${idx}`,
      subjectId: 'abnormal_psych' as const,
      sectionCode: 'B',
      tosCode: '1.2',
      bloomsLevel: 'Analyzing' as const,
      selectedChoice: (isCorrect ? 'B' : 'A') as 'A' | 'B',
      correctChoice: 'B' as const,
      isCorrect,
      mode: 'practice' as const,
      timestamp: 4000 + idx,
    })),
  ];

  const grades = {
    dev_psych: 0,
    psych_assessment: 0,
    abnormal_psych: 0,
    io_psych: 85, // Mock rating strength on I/O
  };

  const allStar = buildSubjectStarGraphData(
    sampleLogs,
    PRC_TOS_SUBJECTS,
    grades,
    {},
    'ALL'
  );

  // 1. 5-spoke star geometry matching reference pentagon
  assert.equal(allStar.spokes.length, 5);
  assert.equal(allStar.spokes[0].paletteKey, 'psych_assessment');
  assert.equal(allStar.spokes[0].angleDeg, -90);
  assert.equal(allStar.spokes[4].paletteKey, 'weighted_gwa');

  // 2. Weight coding: 40%-weighted Psych Assessment spoke is visibly thicker than 20% subjects
  const paSpoke = allStar.spokes.find((s) => s.subjectId === 'psych_assessment')!;
  const devSpoke = allStar.spokes.find((s) => s.subjectId === 'dev_psych')!;
  assert.equal(paSpoke.weightPercent, 40);
  assert.equal(devSpoke.weightPercent, 20);
  assert.ok(paSpoke.spokeStrokeWidth > devSpoke.spokeStrokeWidth);
  assert.equal(paSpoke.currentPercent, 25);
  assert.equal(paSpoke.status, 'CUTOFF_RISK');
  assert.equal(devSpoke.currentPercent, 80);
  assert.equal(devSpoke.status, 'STRENGTH');

  // 3. Weighted readiness composite: 0.40*25 + 0.20*80 + 0.20*60 + 0.20*85 = 10 + 16 + 12 + 17 = 55.0%
  assert.equal(allStar.weightedReadinessPercent, 55);
  assert.equal(allStar.passingSubjectsCount, 2); // Dev (80%) + I/O (85%)
  assert.equal(allStar.cutoffRiskCount, 1); // Psych Assessment (25% < 50%)
  assert.equal(allStar.passingPolygonPoints.split(' ').length, 5);
  assert.equal(allStar.cutoffPolygonPoints.split(' ').length, 5);
  assert.equal(allStar.scorePolygonPoints.split(' ').length, 5);

  // Every spoke label stays inside SVG viewBox horizontally
  for (const s of allStar.spokes) {
    assert.ok(s.labelX > 25 && s.labelX < allStar.viewBoxWidth - 25);
    assert.ok(s.sectorPathD.startsWith('M ') && s.sectorPathD.endsWith('Z'));
  }

  // 4. Strengths & Weaknesses study prompts surface Cutoff Risk Psych Assessment Sec A first
  assert.ok(allStar.strengths.some((st) => st.subjectId === 'dev_psych' && st.sectionLetter === 'A'));
  assert.ok(allStar.studyPrompts.length > 0);
  assert.equal(allStar.studyPrompts[0].subjectId, 'psych_assessment');
  assert.equal(allStar.studyPrompts[0].sectionLetter, 'A');
  assert.equal(allStar.studyPrompts[0].recommendedMode, 'practice');

  // 5. Section-level Star Graph drill-down for Abnormal Psychology (6 spokes, Sec B 50% thickest)
  const abnStar = buildSubjectStarGraphData(
    sampleLogs,
    PRC_TOS_SUBJECTS,
    grades,
    {},
    'abnormal_psych'
  );
  assert.equal(abnStar.spokes.length, 6);
  const secASpoke = abnStar.spokes.find((s) => s.sectionLetter === 'A')!;
  const secBSpoke = abnStar.spokes.find((s) => s.sectionLetter === 'B')!;
  assert.equal(secBSpoke.weightPercent, 50);
  assert.equal(secASpoke.weightPercent, 5);
  assert.ok(secBSpoke.spokeStrokeWidth > secASpoke.spokeStrokeWidth);
  assert.equal(secBSpoke.currentPercent, 60);
  assert.equal(secBSpoke.status, 'DEVELOPING');
});

test('buildSubjectMarimekkoData and buildSectionMarimekkoData compute exact weight-proportional widths, 75% and 50% threshold lines, and GWA point-deficit ranking', async () => {
  const { buildSubjectMarimekkoData, buildSectionMarimekkoData } = await import('./bleppLogic');
  const { PRC_TOS_SUBJECTS } = await import('../data/tosData');

  const logs = [
    // Psych Assessment (40% wt): 3/5 = 60% -> earned = 24.0/40, target = 30.0, gap = 6.0 GWA pts
    ...([true, true, true, false, false] as const).map((ok, i) => ({
      id: `m_pa_${i}`,
      questionId: `mq_pa_${i}`,
      subjectId: 'psych_assessment' as const,
      sectionCode: 'A',
      tosCode: '1.1',
      bloomsLevel: 'Applying' as const,
      selectedChoice: (ok ? 'A' : 'B') as 'A' | 'B',
      correctChoice: 'A' as const,
      isCorrect: ok,
      mode: 'practice' as const,
      timestamp: 5000 + i,
    })),
    // Abnormal Psych (20% wt): 3/5 = 60% -> earned = 12.0/20, target = 15.0, gap = 3.0 GWA pts
    ...([true, true, true, false, false] as const).map((ok, i) => ({
      id: `m_abn_${i}`,
      questionId: `mq_abn_${i}`,
      subjectId: 'abnormal_psych' as const,
      sectionCode: 'B',
      tosCode: '1.2',
      bloomsLevel: 'Analyzing' as const,
      selectedChoice: (ok ? 'C' : 'D') as 'C' | 'D',
      correctChoice: 'C' as const,
      isCorrect: ok,
      mode: 'practice' as const,
      timestamp: 6000 + i,
    })),
    // Dev Psych (20% wt): 4/5 = 80% -> earned = 16.0/20 (STRENGTH >= 75%)
    ...([true, true, true, true, false] as const).map((ok, i) => ({
      id: `m_dev_${i}`,
      questionId: `mq_dev_${i}`,
      subjectId: 'dev_psych' as const,
      sectionCode: 'A',
      tosCode: '1.1',
      bloomsLevel: 'Remembering' as const,
      selectedChoice: (ok ? 'B' : 'A') as 'A' | 'B',
      correctChoice: 'B' as const,
      isCorrect: ok,
      mode: 'practice' as const,
      timestamp: 7000 + i,
    })),
  ];

  const grades = {
    dev_psych: 0,
    psych_assessment: 0,
    abnormal_psych: 0,
    io_psych: 75, // Mock rating at passing target -> 15.0/20
  };

  const mekko = buildSubjectMarimekkoData(logs, PRC_TOS_SUBJECTS, grades, {});

  assert.equal(mekko.columns.length, 4);
  const paCol = mekko.columns.find((c) => c.subjectId === 'psych_assessment')!;
  const devCol = mekko.columns.find((c) => c.subjectId === 'dev_psych')!;
  const abnCol = mekko.columns.find((c) => c.subjectId === 'abnormal_psych')!;

  // 40% Psych Assessment column must be exactly 2x the width of a 20% subject column
  assert.equal(Number((paCol.width / devCol.width).toFixed(2)), 2);
  assert.ok(mekko.passingLineY < mekko.cutoffLineY);

  // Area / GWA point math: 24.0 + 16.0 + 12.0 + 15.0 = 67.0%
  assert.equal(paCol.earnedWeightedPoints, 24);
  assert.equal(paCol.weightedGapToPassing, 6);
  assert.equal(abnCol.earnedWeightedPoints, 12);
  assert.equal(abnCol.weightedGapToPassing, 3);
  assert.equal(mekko.weightedReadinessPercent, 67);
  assert.equal(mekko.weightedGapToOverallPassing, 8);

  // Both PA and Abnormal are at 60%, but PA (40% wt -> -6.0 GWA pts) ranks ahead of Abnormal (20% wt -> -3.0 GWA pts)!
  assert.equal(mekko.studyPrompts.length, 2);
  assert.equal(mekko.studyPrompts[0].subjectId, 'psych_assessment');
  assert.equal(mekko.studyPrompts[0].recommendedMode, 'tos');
  assert.equal(mekko.studyPrompts[0].ctaLabel, 'Practice');
  assert.match(mekko.studyPrompts[0].prioritySectionTitle || '', /^Section A\./);
  assert.equal(mekko.studyPrompts[0].prioritySectionPercent, 60);
  assert.equal(mekko.studyPrompts[1].subjectId, 'abnormal_psych');
  assert.equal(mekko.studyPrompts[1].recommendedMode, 'tos');
  assert.match(mekko.studyPrompts[1].prioritySectionTitle || '', /^Section B\./);
  assert.equal(mekko.studyPrompts[1].prioritySectionPercent, 60);

  // Strengths contains Dev Psych (80%) and I/O Psych (75%)
  assert.equal(mekko.strengths.length, 2);

  // Section-level Marimekko for Abnormal Psychology in Analytics: Sec B (50%) is 10x Sec A (5%)
  const abnSecMekko = buildSectionMarimekkoData(
    logs,
    PRC_TOS_SUBJECTS,
    grades,
    {},
    'abnormal_psych'
  );
  assert.equal(abnSecMekko.columns.length, 6);
  const secA = abnSecMekko.columns.find((c) => c.sectionLetter === 'A')!;
  const secB = abnSecMekko.columns.find((c) => c.sectionLetter === 'B')!;
  assert.equal(Number((secB.width / secA.width).toFixed(2)), 10);
  assert.equal(secB.currentPercent, 60);
  assert.equal(secB.earnedSectionPoints, 30);
});

test('calculateExamCountdown computes exact days, hours, minutes, and seconds and handles EXAM_DAY and PAST states', async () => {
  const {
    parseLocalExamDate,
    calculateExamCountdown,
    getSuggestedExamDates,
  } = await import('./bleppLogic');

  assert.equal(parseLocalExamDate(''), null);
  assert.equal(parseLocalExamDate('2027-02-30'), null);
  assert.ok(parseLocalExamDate('2027-09-24') instanceof Date);

  // Local reference timestamp: 2026-11-14 06:15:30 local time
  const nowLocal = new Date(2026, 10, 14, 6, 15, 30, 0).getTime();
  // Target: 2026-11-16 00:00:00 local time -> 1 day, 17 hours, 44 minutes, 30 seconds
  const upcoming = calculateExamCountdown('2026-11-16', nowLocal);
  assert.ok(upcoming);
  assert.equal(upcoming.status, 'UPCOMING');
  assert.equal(upcoming.days, 1);
  assert.equal(upcoming.hours, 17);
  assert.equal(upcoming.minutes, 44);
  assert.equal(upcoming.seconds, 30);

  // Same calendar date -> EXAM_DAY
  const examDay = calculateExamCountdown('2026-11-14', nowLocal);
  assert.ok(examDay);
  assert.equal(examDay.status, 'EXAM_DAY');
  assert.equal(examDay.days, 0);
  assert.equal(examDay.seconds, 0);

  // Earlier calendar date -> PAST
  const past = calculateExamCountdown('2026-11-10', nowLocal);
  assert.ok(past);
  assert.equal(past.status, 'PAST');

  const presets = getSuggestedExamDates(nowLocal);
  assert.equal(presets.length, 4);
  assert.equal(presets[3].dateStr, '2027-09-24');
});

test('Psychological Assessment mock exam uses 130 items across batches and resumable sessions while other subjects use 100', async () => {
  const {
    getSubjectMockExamSize,
    buildMockExamSectionBatches,
    createEmptySubjectSession,
    findResumableSessions,
    PSYCH_ASSESSMENT_MOCK_EXAM_SIZE,
    MOCK_EXAM_SIZE,
  } = await import('./bleppLogic');
  const { PRC_TOS_SUBJECTS } = await import('../data/tosData');

  assert.equal(PSYCH_ASSESSMENT_MOCK_EXAM_SIZE, 130);
  assert.equal(MOCK_EXAM_SIZE, 100);
  assert.equal(getSubjectMockExamSize('psych_assessment'), 130);
  assert.equal(PRC_TOS_SUBJECTS.psych_assessment.totalBoardItems, 130);

  assert.equal(getSubjectMockExamSize('dev_psych'), 100);
  assert.equal(getSubjectMockExamSize('abnormal_psych'), 100);
  assert.equal(getSubjectMockExamSize('io_psych'), 100);

  const paBatches = buildMockExamSectionBatches(
    PRC_TOS_SUBJECTS.psych_assessment.sections,
    130,
    25
  );
  const paSum = paBatches.reduce((sum, b) => sum + b.count, 0);
  assert.equal(paSum, 130);
  assert.ok(paBatches.every((b) => b.count > 0 && b.count <= 25));

  // Resumable blank-sheet shading on Psych Assessment reports 130 total items
  const paSession = createEmptySubjectSession(180);
  paSession.mock.shadedMap = { 1: 'A', 120: 'C' };
  paSession.mock.updatedAt = 5000;

  const resumable = findResumableSessions(
    { psych_assessment: paSession },
    {
      dev_psych: [],
      psych_assessment: [],
      abnormal_psych: [],
      io_psych: [],
    },
    PRC_TOS_SUBJECTS
  );
  assert.equal(resumable.length, 1);
  assert.equal(resumable[0].subjectId, 'psych_assessment');
  assert.equal(resumable[0].totalItems, 130);
  assert.equal(resumable[0].completedCount, 2);
});

test('extractFirstName, extractProfileInitials, and calculateDailyQuestionProgress compute profile greeting and daily item progress accurately', async () => {
  const {
    extractFirstName,
    extractProfileInitials,
    normalizeDailyQuestionGoal,
    calculateDailyQuestionProgress,
    DEFAULT_DAILY_QUESTION_GOAL,
  } = await import('./bleppLogic');

  assert.equal(extractFirstName('Maria Clara Santos', 'maria@example.com'), 'Maria');
  assert.equal(extractFirstName('  Lorenzo  ', 'lorenzo@example.com'), 'Lorenzo');
  assert.equal(extractFirstName('', 'juan.delacruz99@gmail.com'), 'Juan');
  assert.equal(extractFirstName('', 'preview@bleppify.app'), 'Future RPm');
  assert.equal(extractFirstName(null, null), 'Future RPm');

  assert.equal(extractProfileInitials('Maria Clara Santos', null), 'MS');
  assert.equal(extractProfileInitials('Lorenzo', null), 'LO');
  assert.equal(extractProfileInitials('', 'abarico@google.com'), 'AB');
  assert.equal(extractProfileInitials('', 'preview@bleppify.app'), 'RP');

  assert.equal(normalizeDailyQuestionGoal(undefined), DEFAULT_DAILY_QUESTION_GOAL);
  assert.equal(normalizeDailyQuestionGoal(1), 5);
  assert.equal(normalizeDailyQuestionGoal(45), 45);
  assert.equal(normalizeDailyQuestionGoal(999), 500);

  const nowMs = new Date(2026, 10, 14, 14, 30, 0, 0).getTime();
  const yesterdayMs = new Date(2026, 10, 13, 22, 15, 0, 0).getTime();
  const todayMorningMs = new Date(2026, 10, 14, 9, 0, 0, 0).getTime();

  const progress = calculateDailyQuestionProgress(
    [
      {
        id: 'y1',
        questionId: 'q_old',
        subjectId: 'dev_psych',
        sectionCode: 'A',
        tosCode: '1.1',
        bloomsLevel: 'Remembering',
        selectedChoice: 'A',
        correctChoice: 'A',
        isCorrect: true,
        timestamp: yesterdayMs,
        mode: 'practice',
      },
      {
        id: 't1',
        questionId: 'q_1',
        subjectId: 'psych_assessment',
        sectionCode: 'A',
        tosCode: '1.1',
        bloomsLevel: 'Applying',
        selectedChoice: 'B',
        correctChoice: 'B',
        isCorrect: true,
        timestamp: todayMorningMs,
        mode: 'practice',
      },
      {
        id: 't2',
        questionId: 'q_2',
        subjectId: 'psych_assessment',
        sectionCode: 'B',
        tosCode: '2.1',
        bloomsLevel: 'Analyzing',
        selectedChoice: 'C',
        correctChoice: 'A',
        isCorrect: false,
        timestamp: nowMs - 1000,
        mode: 'practice',
      },
      // Duplicate id on same day should be ignored
      {
        id: 't2',
        questionId: 'q_2',
        subjectId: 'psych_assessment',
        sectionCode: 'B',
        tosCode: '2.1',
        bloomsLevel: 'Analyzing',
        selectedChoice: 'C',
        correctChoice: 'A',
        isCorrect: false,
        timestamp: nowMs - 1000,
        mode: 'practice',
      },
    ],
    10,
    nowMs
  );

  assert.equal(progress.dailyGoal, 10);
  assert.equal(progress.answeredToday, 2);
  assert.equal(progress.correctToday, 1);
  assert.equal(progress.accuracyTodayPercent, 50);
  assert.equal(progress.remainingToday, 8);
  assert.equal(progress.progressPercent, 20);
  assert.equal(progress.isGoalMet, false);
});

test('computeAvatarCropSourceRect, getBoardMotivationalQuote, and 25/5 Pomodoro defaults behave deterministically', async () => {
  const {
    computeAvatarCropSourceRect,
    getBoardMotivationalQuote,
    BLEPP_MOTIVATIONAL_QUOTES,
    DEFAULT_POMODORO_STUDY_MINUTES,
    DEFAULT_POMODORO_BREAK_MINUTES,
  } = await import('./bleppLogic');

  assert.equal(DEFAULT_POMODORO_STUDY_MINUTES, 25);
  assert.equal(DEFAULT_POMODORO_BREAK_MINUTES, 5);

  // Landscape 1200x600 at zoom 1, centered -> 600x600 at sx=300, sy=0
  const centered = computeAvatarCropSourceRect(1200, 600, 1, 0, 0);
  assert.equal(centered.sSide, 600);
  assert.equal(centered.sx, 300);
  assert.equal(centered.sy, 0);

  // Select leftmost section (panX = -1) -> sx = 0
  const leftEdge = computeAvatarCropSourceRect(1200, 600, 1, -1, 0);
  assert.equal(leftEdge.sx, 0);
  assert.equal(leftEdge.sy, 0);

  // Select rightmost section (panX = +1) -> sx = 600 (never stuck on left!)
  const rightEdge = computeAvatarCropSourceRect(1200, 600, 1, 1, 0);
  assert.equal(rightEdge.sx, 600);
  assert.equal(rightEdge.sy, 0);

  // Zoom = 2 on 1200x600 -> sSide = 300; panY = +1 selects bottom edge sy = 300
  const zoomedBottom = computeAvatarCropSourceRect(1200, 600, 2, 0, 1);
  assert.equal(zoomedBottom.sSide, 300);
  assert.equal(zoomedBottom.sx, 450);
  assert.equal(zoomedBottom.sy, 300);

  // Clicking focal points on full photo maps accurately to source crop rectangle
  const { computeCropPanFromImagePoint } = await import('./bleppLogic');
  const rightClickPan = computeCropPanFromImagePoint(1200, 600, 1, 1050, 300);
  assert.equal(rightClickPan.panX, 1);
  const rightClickRect = computeAvatarCropSourceRect(
    1200,
    600,
    1,
    rightClickPan.panX,
    rightClickPan.panY
  );
  assert.equal(rightClickRect.sx, 600);

  const squareZoomedBottomRight = computeCropPanFromImagePoint(600, 600, 2, 500, 500);
  assert.equal(squareZoomedBottomRight.panX, 1);
  assert.equal(squareZoomedBottomRight.panY, 1);
  const sqRect = computeAvatarCropSourceRect(
    600,
    600,
    2,
    squareZoomedBottomRight.panX,
    squareZoomedBottomRight.panY
  );
  assert.equal(sqRect.sx, 300);
  assert.equal(sqRect.sy, 300);
  assert.equal(sqRect.sSide, 300);

  // Motivational quotes all include non-empty quote, author, and reference work/role
  assert.ok(BLEPP_MOTIVATIONAL_QUOTES.length >= 6);
  for (const item of BLEPP_MOTIVATIONAL_QUOTES) {
    assert.ok(item.quote.length > 10);
    assert.ok(item.author.length > 2);
    assert.ok(item.workOrRole.length > 2);
  }

  const fixedTime = new Date(2026, 10, 15, 9, 0, 0, 0).getTime();
  const q0 = getBoardMotivationalQuote(0, fixedTime);
  const q1 = getBoardMotivationalQuote(1, fixedTime);
  assert.notEqual(q0.id, q1.id);
});

test('computeAutomaticProgressGwa and editable topnotcherThreshold compute progress-based GWA without manual overwrites and adapt dynamically to user threshold', async () => {
  const {
    computeAutomaticProgressGwa,
    buildSubjectMarimekkoData,
    buildSectionMarimekkoData,
    analyzeStrengthsAndWeaknesses,
    normalizeTopnotcherThreshold,
    DEFAULT_TOPNOTCHER_TARGET_PERCENT,
    QUOTE_AUTO_ROTATE_INTERVAL_MS,
  } = await import('./bleppLogic');
  const { PRC_TOS_SUBJECTS } = await import('../data/tosData');

  assert.equal(DEFAULT_TOPNOTCHER_TARGET_PERCENT, 90);
  assert.equal(normalizeTopnotcherThreshold(undefined), 90);
  assert.equal(normalizeTopnotcherThreshold(85), 85);
  assert.equal(normalizeTopnotcherThreshold(92.5), 92.5);
  assert.equal(normalizeTopnotcherThreshold(50), 76);
  assert.equal(normalizeTopnotcherThreshold(105), 99);
  assert.ok(QUOTE_AUTO_ROTATE_INTERVAL_MS >= 5000);

  // 1. Fresh user with zero progress -> 0.00% GWA, all 4 subjects Untested
  const emptyGwa = computeAutomaticProgressGwa([], PRC_TOS_SUBJECTS, {}, { topnotcherMode: false });
  assert.equal(emptyGwa.gwa, 0);
  assert.equal(emptyGwa.hasAnyProgress, false);
  assert.equal(emptyGwa.subjectRows.psych_assessment.source, 'UNTESTED');

  // 2. Stale manual grades in legacy state MUST NOT overwrite Weaknesses & Study Prompts when ignoreManualGrades is true
  const staleManualGrades = {
    dev_psych: 95,
    psych_assessment: 95,
    abnormal_psych: 95,
    io_psych: 95,
  };
  const cleanMekko = buildSubjectMarimekkoData([], PRC_TOS_SUBJECTS, staleManualGrades, {}, {
    ignoreManualGrades: true,
    topnotcherMode: false,
  });
  assert.equal(cleanMekko.testedSubjectsCount, 0);
  assert.equal(cleanMekko.strengths.length, 0);
  assert.equal(cleanMekko.studyPrompts.length, 4);
  assert.equal(cleanMekko.studyPrompts[0].subjectId, 'psych_assessment');

  // 3. Build real progress:
  // - Psych Assessment (40% wt): 4/5 = 80%
  // - Dev Psych (20% wt): 4/5 = 80%
  // - Abnormal Psych (20% wt): 9/10 = 90%
  // - I/O Psych (20% wt): 3/4 = 75%
  // Overall GWA = 0.40*80 + 0.20*80 + 0.20*90 + 0.20*75 = 81.00%
  const logs = [
    ...([true, true, true, true, false] as const).map((ok, i) => ({
      id: `tn_pa_${i}`,
      questionId: `tnq_pa_${i}`,
      subjectId: 'psych_assessment' as const,
      sectionCode: 'A',
      tosCode: '1.1',
      bloomsLevel: 'Applying' as const,
      selectedChoice: (ok ? 'A' : 'B') as 'A' | 'B',
      correctChoice: 'A' as const,
      isCorrect: ok,
      mode: 'practice' as const,
      timestamp: 10000 + i,
    })),
    ...([true, true, true, true, false] as const).map((ok, i) => ({
      id: `tn_dev_${i}`,
      questionId: `tnq_dev_${i}`,
      subjectId: 'dev_psych' as const,
      sectionCode: 'A',
      tosCode: '1.1',
      bloomsLevel: 'Remembering' as const,
      selectedChoice: (ok ? 'B' : 'C') as 'B' | 'C',
      correctChoice: 'B' as const,
      isCorrect: ok,
      mode: 'practice' as const,
      timestamp: 11000 + i,
    })),
    ...([true, true, true, true, true, true, true, true, true, false] as const).map((ok, i) => ({
      id: `tn_abn_${i}`,
      questionId: `tnq_abn_${i}`,
      subjectId: 'abnormal_psych' as const,
      sectionCode: 'B',
      tosCode: '2.1',
      bloomsLevel: 'Analyzing' as const,
      selectedChoice: (ok ? 'C' : 'A') as 'A' | 'C',
      correctChoice: 'C' as const,
      isCorrect: ok,
      mode: 'mock' as const,
      timestamp: 12000 + i,
    })),
    ...([true, true, true, false] as const).map((ok, i) => ({
      id: `tn_io_${i}`,
      questionId: `tnq_io_${i}`,
      subjectId: 'io_psych' as const,
      sectionCode: 'A',
      tosCode: '1.1',
      bloomsLevel: 'Applying' as const,
      selectedChoice: (ok ? 'D' : 'A') as 'A' | 'D',
      correctChoice: 'D' as const,
      isCorrect: ok,
      mode: 'practice' as const,
      timestamp: 13000 + i,
    })),
  ];

  // Standard Passing Mode (75%): 81.00% GWA passes, all 4 subjects >= 75% are Strengths, 0 study prompts
  const stdGwa = computeAutomaticProgressGwa(logs, PRC_TOS_SUBJECTS, {}, { topnotcherMode: false });
  assert.equal(stdGwa.gwa, 81);
  assert.equal(stdGwa.passedOverall, true);
  assert.equal(stdGwa.achievedTopnotcher, false);
  assert.equal(stdGwa.targetVerdictLabel, 'PASSED (≥75.0%)');
  assert.equal(stdGwa.topnotcherCoachNote, null);

  const stdMekko = buildSubjectMarimekkoData(logs, PRC_TOS_SUBJECTS, staleManualGrades, {}, {
    ignoreManualGrades: true,
    topnotcherMode: false,
  });
  assert.equal(stdMekko.strengths.length, 4);
  assert.equal(stdMekko.studyPrompts.length, 0);

  // Default Topnotcher Mode (90%): 81.00% GWA needs +9.00% for 90% Topnotcher!
  // Abnormal Psych (90%) stays in Strengths (>=90%), while PA (80%), I/O (75%), and Dev (80%) enter Study Prompts with 'Push to 90%'
  const top90Gwa = computeAutomaticProgressGwa(logs, PRC_TOS_SUBJECTS, {}, {
    topnotcherMode: true,
  });
  assert.equal(top90Gwa.gwa, 81);
  assert.equal(top90Gwa.targetPercent, 90);
  assert.equal(top90Gwa.gapToTopnotcher, 9);
  assert.equal(top90Gwa.targetVerdictLabel, 'PASSING · +9.00% TO TOPNOTCHER');
  assert.equal(top90Gwa.topnotcherCoachNote, null);

  const top90Mekko = buildSubjectMarimekkoData(logs, PRC_TOS_SUBJECTS, staleManualGrades, {}, {
    ignoreManualGrades: true,
    topnotcherMode: true,
  });
  assert.equal(top90Mekko.activeTargetPercent, 90);
  assert.ok(top90Mekko.topnotcherLineY < top90Mekko.passingLineY);
  assert.equal(top90Mekko.strengths.length, 1);
  assert.equal(top90Mekko.strengths[0].subjectId, 'abnormal_psych');
  assert.equal(top90Mekko.studyPrompts.length, 3);
  assert.equal(top90Mekko.studyPrompts[0].ctaLabel, 'Push to 90%');

  // Custom Editable Topnotcher Threshold = 92%: even Abnormal Psych (90%) moves into Study Prompts ('Push to 92%')!
  const top92Mekko = buildSubjectMarimekkoData(logs, PRC_TOS_SUBJECTS, staleManualGrades, {}, {
    ignoreManualGrades: true,
    topnotcherMode: true,
    topnotcherThreshold: 92,
  });
  assert.equal(top92Mekko.activeTargetPercent, 92);
  assert.equal(top92Mekko.strengths.length, 0);
  assert.equal(top92Mekko.studyPrompts.length, 4);
  assert.equal(top92Mekko.studyPrompts[0].ctaLabel, 'Push to 92%');

  // Custom Editable Topnotcher Threshold = 85%: gap is +4.00% and status is 'Topnotcher (≥85%)'
  const top85Gwa = computeAutomaticProgressGwa(logs, PRC_TOS_SUBJECTS, {}, {
    topnotcherMode: true,
    topnotcherThreshold: 85,
  });
  assert.equal(top85Gwa.gapToTopnotcher, 4);
  assert.equal(top85Gwa.subjectRows.abnormal_psych.statusLabel, 'Topnotcher (≥85%)');

  // Section-level analytics also promotes 80% section from STRENGTH (std) to DEVELOPING (topnotcher)
  const topReport = analyzeStrengthsAndWeaknesses(logs, PRC_TOS_SUBJECTS, staleManualGrades, {
    ignoreManualGrades: true,
    topnotcherMode: true,
    topnotcherThreshold: 88,
  });
  const paSecA = topReport.allTopicStats.find(
    (t) => t.subjectId === 'psych_assessment' && t.sectionLetter === 'A'
  )!;
  assert.equal(paSecA.status, 'DEVELOPING');
  assert.ok(paSecA.insight.includes('88%'));

  const topSecMekko = buildSectionMarimekkoData(
    logs,
    PRC_TOS_SUBJECTS,
    staleManualGrades,
    {},
    'psych_assessment',
    { ignoreManualGrades: true, topnotcherMode: true, topnotcherThreshold: 88 }
  );
  assert.equal(topSecMekko.activeTargetPercent, 88);
  assert.ok(topSecMekko.columns[0].deficitHeight > 0);
});




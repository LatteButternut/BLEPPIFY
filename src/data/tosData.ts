import {
  AdaptiveTipResult,
  BloomsLevel,
  buildAdaptiveExamTip,
  ShadedChoice,
  SubjectId,
} from '../utils/bleppLogic';

export interface TosCompetency {
  id: string;
  code: string;
  description: string;
  itemCount: number;
  bloomsBreakdown: string;
  primaryBlooms: BloomsLevel;
}

export interface TosSection {
  id: string;
  sectionLetter: string;
  title: string;
  weightPercent: number;
  itemCount: number;
  competencies: TosCompetency[];
}

export interface FlashcardItem {
  id: string;
  term: string;
  definition: string;
  tosCode: string;
  bloomsLevel: BloomsLevel;
  status: 'unseen' | 'learning' | 'mastered';
}

export interface BoardQuestionItem {
  id: string;
  stem: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctChoice: 'A' | 'B' | 'C' | 'D';
  sectionCode: string;
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

let cachedSeedById: Record<string, BoardQuestionItem> | null = null;

function getSeedQuestionById(id: string): BoardQuestionItem | undefined {
  if (!cachedSeedById) {
    cachedSeedById = {};
    (Object.keys(PRC_TOS_SUBJECTS) as SubjectId[]).forEach((subjId) => {
      for (const sq of PRC_TOS_SUBJECTS[subjId].seedQuestions) {
        cachedSeedById![sq.id] = sq;
      }
    });
  }
  return cachedSeedById[id];
}

function isLegacyDistractorPlaceholder(text?: string): boolean {
  if (!text) return true;
  return text.includes('is a look-alike distractor that does not satisfy the specific criterion pointing to');
}

/**
 * Returns structured choice-by-choice rationalizations for A, B, C, and D,
 * explaining why the correct choice is the best answer in the question's context
 * and why each of the other 3 choices is not the answer based on the stem's cues.
 */
export function getQuestionOptionRationales(q: BoardQuestionItem): {
  A: string;
  B: string;
  C: string;
  D: string;
} {
  if (
    q.optionRationales &&
    q.optionRationales.A &&
    q.optionRationales.B &&
    q.optionRationales.C &&
    q.optionRationales.D &&
    !isLegacyDistractorPlaceholder(q.optionRationales.A) &&
    !isLegacyDistractorPlaceholder(q.optionRationales.B) &&
    !isLegacyDistractorPlaceholder(q.optionRationales.C) &&
    !isLegacyDistractorPlaceholder(q.optionRationales.D)
  ) {
    return q.optionRationales;
  }

  const canonicalSeed = getSeedQuestionById(q.id);
  if (canonicalSeed?.optionRationales) {
    return canonicalSeed.optionRationales;
  }

  const out: { A: string; B: string; C: string; D: string } = {
    A: '',
    B: '',
    C: '',
    D: '',
  };

  (['A', 'B', 'C', 'D'] as const).forEach((letter) => {
    const optText = q.options[letter];
    const correctText = q.options[q.correctChoice];
    if (letter === q.correctChoice) {
      out[letter] = q.rationale;
      return;
    }

    const misconceptionNote = q.adaptiveTips?.misconceptionTips?.[letter]?.trim();
    if (misconceptionNote) {
      out[letter] = misconceptionNote;
      return;
    }

    // Check if q.rationale contains a specific sentence referencing this distractor
    const sentences = q.rationale
      .split(/(?<=[.;])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const matchingSentence = sentences.find((s) =>
      s.toLowerCase().includes(optText.toLowerCase())
    );
    if (matchingSentence && matchingSentence !== q.rationale.trim()) {
      out[letter] = matchingSentence;
      return;
    }

    out[letter] = `Not the answer in this question's context: "${optText}" does not account for the specific conditions in the stem that point to "${correctText}".`;
  });

  return out;
}

/**
 * Returns an adaptive board exam tip tailored to the exact option submitted by the user:
 * - Clears the specific misconception if the user picked a wrong option based on the question's context.
 * - Provides a best-answer expansion/summary if the user picked the right option.
 */
export function getAdaptiveQuestionExamTip(
  q: BoardQuestionItem,
  submittedChoice: ShadedChoice
): AdaptiveTipResult {
  const canonicalSeed = getSeedQuestionById(q.id);
  const enriched: BoardQuestionItem = canonicalSeed
    ? {
        ...canonicalSeed,
        ...q,
        optionRationales:
          q.optionRationales && !isLegacyDistractorPlaceholder(q.optionRationales.A)
            ? q.optionRationales
            : canonicalSeed.optionRationales,
        examTip: q.examTip || canonicalSeed.examTip,
        adaptiveTips: q.adaptiveTips || canonicalSeed.adaptiveTips,
      }
    : q;
  return buildAdaptiveExamTip(enriched, submittedChoice);
}

export const OFFICIAL_PRC_TOS_PDF_PATH =
  '/assets/aistudio/Table_of_Specifications_3b7eaeb4.pdf';

export interface SubjectConfig {
  id: SubjectId;
  shortTitle: string;
  fullTitle: string;
  officialTosSubjectHeader: string;
  officialPdfPageRange: string;
  officialPdfStartPage: number;
  weightPercent: number;
  totalBoardItems: number;
  examDurationMinutes: number;
  bloomsDistributionSummary: string;
  referenceTextbooks: string;
  sections: TosSection[];
  seedFlashcards: FlashcardItem[];
  seedQuestions: BoardQuestionItem[];
}

export const PRC_TOS_SUBJECTS: Record<SubjectId, SubjectConfig> = {
  dev_psych: {
    id: 'dev_psych',
    shortTitle: 'Dev Psych',
    fullTitle: 'Developmental Psychology',
    officialTosSubjectHeader: 'Annex "B" · Board for Psychometrician (As of February 2023 · PQF Level 6)',
    officialPdfPageRange: 'Pages 11–13',
    officialPdfStartPage: 11,
    weightPercent: 20,
    totalBoardItems: 100,
    examDurationMinutes: 180,
    bloomsDistributionSummary:
      'Easy 30% (15 Rem · 15 Und) · Moderate 40% (40 App) · Difficult 30% (20 Ana · 10 Eva)',
    referenceTextbooks: 'Papalia & Martorell (Experience Human Development), Santrock (Life-Span Development)',
    sections: [
      {
        id: 'dev_A',
        sectionLetter: 'A',
        title: 'Perspectives on Nature and Nurture',
        weightPercent: 5,
        itemCount: 5,
        competencies: [
          {
            id: 'dev_A_1_1',
            code: '1.1',
            description: 'Explain the role of heredity and environment in human growth and development',
            itemCount: 2,
            bloomsBreakdown: '2 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'dev_A_1_2',
            code: '1.2',
            description: 'Illustrate the influence of heredity and environment on the development of persons',
            itemCount: 2,
            bloomsBreakdown: '2 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'dev_A_1_3',
            code: '1.3',
            description: 'Identify the characteristics that pertain to heredity and environment',
            itemCount: 1,
            bloomsBreakdown: '1 Remembering',
            primaryBlooms: 'Remembering',
          },
        ],
      },
      {
        id: 'dev_B',
        sectionLetter: 'B',
        title: 'Research Methods in Developmental Psychology and Ethical Considerations',
        weightPercent: 5,
        itemCount: 5,
        competencies: [
          {
            id: 'dev_B_1_1',
            code: '1.1',
            description: 'Identify the ethical consideration of various research methods in developmental psychology',
            itemCount: 2,
            bloomsBreakdown: '2 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'dev_B_2_1',
            code: '2.1',
            description: 'Recognize the different basic research designs in studying human development',
            itemCount: 2,
            bloomsBreakdown: '2 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'dev_B_2_2',
            code: '2.2',
            description: 'Differentiate cross-sectional and longitudinal studies in conducting research investigation in human development',
            itemCount: 1,
            bloomsBreakdown: '1 Analyzing',
            primaryBlooms: 'Analyzing',
          },
        ],
      },
      {
        id: 'dev_C',
        sectionLetter: 'C',
        title: 'Developmental Theories',
        weightPercent: 25,
        itemCount: 25,
        competencies: [
          {
            id: 'dev_C_1_1',
            code: '1.1',
            description: 'Assess the development of personality in the light of psychosexual theory of Freud',
            itemCount: 3,
            bloomsBreakdown: '3 Evaluating',
            primaryBlooms: 'Evaluating',
          },
          {
            id: 'dev_C_1_2',
            code: '1.2',
            description: 'Illustrate and evaluate the development of personality in the light of psychosocial theory of Erikson',
            itemCount: 4,
            bloomsBreakdown: '2 Applying · 2 Evaluating',
            primaryBlooms: 'Applying',
          },
          {
            id: 'dev_C_1_3',
            code: '1.3',
            description: 'Illustrate the cognitive development of a person across the life span based on Piaget',
            itemCount: 3,
            bloomsBreakdown: '3 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'dev_C_1_4',
            code: '1.4',
            description: 'Differentiate and illustrate the moral development of a person across the life span based on Kohlberg',
            itemCount: 2,
            bloomsBreakdown: '2 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'dev_C_1_5',
            code: '1.5',
            description: 'Illustrate the impact of ecological model in the development of personality based on Bronfenbrenner',
            itemCount: 2,
            bloomsBreakdown: '2 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'dev_C_1_6',
            code: '1.6',
            description: 'Apply the socio-cultural theory in the development of personality of Vygotsky',
            itemCount: 2,
            bloomsBreakdown: '2 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'dev_C_1_7',
            code: '1.7',
            description: 'Illustrate the role of attachment in the development of personality and other human attributes based on Ainsworth and Mahler',
            itemCount: 3,
            bloomsBreakdown: '3 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'dev_C_1_8',
            code: '1.8',
            description: 'Illustrate the theory of identity formation during adolescence period based on Marcia',
            itemCount: 2,
            bloomsBreakdown: '2 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'dev_C_1_9',
            code: '1.9',
            description: 'Compare the different learning theories in explaining the development of personality and other human attributes based on behaviorism and social learning',
            itemCount: 2,
            bloomsBreakdown: '2 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'dev_C_1_10',
            code: '1.10',
            description: 'Analyze the evolutionary theory of development of Wilson',
            itemCount: 2,
            bloomsBreakdown: '2 Analyzing',
            primaryBlooms: 'Analyzing',
          },
        ],
      },
      {
        id: 'dev_D',
        sectionLetter: 'D',
        title: 'Developmental Principles',
        weightPercent: 5,
        itemCount: 5,
        competencies: [
          {
            id: 'dev_D_1_1',
            code: '1.1',
            description: 'Explain appropriate developmental principles in the study of life-span development',
            itemCount: 5,
            bloomsBreakdown: '2 Understanding · 3 Analyzing',
            primaryBlooms: 'Analyzing',
          },
        ],
      },
      {
        id: 'dev_E',
        sectionLetter: 'E',
        title: 'Developmental Issues and Tasks on Developmental Stages',
        weightPercent: 30,
        itemCount: 30,
        competencies: [
          {
            id: 'dev_E_1_1',
            code: '1.1',
            description: 'Explain the critical issues pertaining to heredity and environmental influences during prenatal development',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'dev_E_1_2',
            code: '1.2',
            description: 'Illustrate the critical issues related to physical, cognitive, socio-emotional development during prenatal development',
            itemCount: 5,
            bloomsBreakdown: '5 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'dev_E_1_3',
            code: '1.3',
            description: 'Assess the developmental issues concerning physical, cognitive, and socio-emotional development during childhood, adolescence, and adulthood stages of development',
            itemCount: 5,
            bloomsBreakdown: '5 Evaluating',
            primaryBlooms: 'Evaluating',
          },
          {
            id: 'dev_E_1_4',
            code: '1.4',
            description: 'Identify critical issues concerning death and bereavement',
            itemCount: 2,
            bloomsBreakdown: '2 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'dev_E_2_1',
            code: '2.1',
            description: 'Explain the expected developmental tasks in physical, cognitive, and socio-emotional during childhood, adolescence, and adulthood stages of development',
            itemCount: 5,
            bloomsBreakdown: '5 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'dev_E_2_2',
            code: '2.2',
            description: 'Assess the expected developmental tasks in physical, cognitive, and socio-emotional during childhood and adolescence stage of development',
            itemCount: 5,
            bloomsBreakdown: '5 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'dev_E_2_3',
            code: '2.3',
            description: 'Illustrate developmental tasks in physical, cognitive, and socio-emotional expected during adulthood stage of development',
            itemCount: 5,
            bloomsBreakdown: '5 Applying',
            primaryBlooms: 'Applying',
          },
        ],
      },
      {
        id: 'dev_F',
        sectionLetter: 'F',
        title: 'Developmental Challenges and Milestones on Developmental Stages',
        weightPercent: 30,
        itemCount: 30,
        competencies: [
          {
            id: 'dev_F_1_1',
            code: '1.1',
            description: 'Explain the challenges faced during prenatal and childhood stages of development',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'dev_F_1_2',
            code: '1.2',
            description: 'Illustrate the challenges faced during the adolescence and adulthood stages of development',
            itemCount: 5,
            bloomsBreakdown: '5 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'dev_F_1_3',
            code: '1.3',
            description: 'Differentiate the challenges concerning prenatal, childhood, adolescence, and adulthood',
            itemCount: 5,
            bloomsBreakdown: '5 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'dev_F_1_4',
            code: '1.4',
            description: 'Identify the challenges of coping with death of another person',
            itemCount: 2,
            bloomsBreakdown: '2 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'dev_F_2_1',
            code: '2.1',
            description: 'Point out the expected developmental milestones on physical, cognitive, and socio-emotional development during childhood, adolescence, and adulthood',
            itemCount: 6,
            bloomsBreakdown: '6 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'dev_F_2_2',
            code: '2.2',
            description: 'Illustrate developmental milestones on physical, cognitive, and socio-emotional development during childhood, adolescence, and adulthood stages of development',
            itemCount: 6,
            bloomsBreakdown: '6 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'dev_F_2_3',
            code: '2.3',
            description: 'Illustrate issues involved in decisions about death',
            itemCount: 3,
            bloomsBreakdown: '3 Applying',
            primaryBlooms: 'Applying',
          },
        ],
      },
    ],
    seedFlashcards: [
      {
        id: 'dev_fc_1',
        term: 'Canalization vs. Evocative Gene-Environment Correlation (Scarr & McCartney)',
        definition:
          'Canalization refers to how strongly heredity restricts the range of development for certain traits (e.g., infant motor milestones). Evocative (reactive) correlation occurs when a child’s genetically influenced temperament evokes predictable responses from caregivers.',
        tosCode: 'Section A · 1.2 Heredity & Environment',
        bloomsLevel: 'Applying',
        status: 'unseen',
      },
      {
        id: 'dev_fc_2',
        term: 'James Marcia’s Four Identity Statuses (Crisis/Exploration × Commitment)',
        definition:
          '1. Identity Achievement: Crisis present + Commitment present.\n2. Moratorium: Active crisis/exploration + No firm commitment yet.\n3. Foreclosure: No exploration + Commitment adopted uncritically from authority/parents.\n4. Identity Diffusion: No exploration + No commitment.',
        tosCode: 'Section C · 1.8 Marcia Identity Formation',
        bloomsLevel: 'Applying',
        status: 'unseen',
      },
      {
        id: 'dev_fc_3',
        term: 'Sequential Design vs. Cross-Sectional & Longitudinal Designs',
        definition:
          'Cross-sectional compares different age cohorts at one point in time (vulnerable to cohort effects). Longitudinal tracks the same cohort repeatedly over time (vulnerable to attrition & practice effects). Sequential combines both to separate age changes from cohort effects.',
        tosCode: 'Section B · 2.2 Research Designs',
        bloomsLevel: 'Analyzing',
        status: 'unseen',
      },
      {
        id: 'dev_fc_4',
        term: 'Margaret Mahler’s Separation-Individuation Subphases',
        definition:
          'Following Normal Autism (0–1 mo) and Normal Symbiosis (1–5 mo): 1. Differentiation/Hatching (5–9 mo), 2. Practicing (9–15 mo), 3. Rapprochement (15–24 mo, ambivalence between autonomy and closeness), 4. Object Constancy (24–36+ mo).',
        tosCode: 'Section C · 1.7 Attachment & Mahler',
        bloomsLevel: 'Applying',
        status: 'unseen',
      },
      {
        id: 'dev_fc_5',
        term: 'Bronfenbrenner’s Exosystem vs. Mesosystem',
        definition:
          'Mesosystem: Linkages between two or more microsystems directly containing the child (e.g., home-school parent-teacher conference). Exosystem: Linkages where at least one setting does not directly contain the child (e.g., a parent’s stressful workplace policy affecting home parenting).',
        tosCode: 'Section C · 1.5 Bronfenbrenner Ecological Model',
        bloomsLevel: 'Applying',
        status: 'unseen',
      },
    ],
    seedQuestions: [
      {
        id: 'dev_q_1',
        stem: 'Jomar, a 19-year-old college sophomore in Manila, tells his guidance counselor that he enrolled in Accountancy solely because both of his parents are CPAs and run a family auditing firm. He has never explored other degree programs and feels no need to question their plan for him. According to James Marcia, Jomar is demonstrating which identity status?',
        options: {
          A: 'Identity Moratorium',
          B: 'Identity Foreclosure',
          C: 'Identity Diffusion',
          D: 'Identity Achievement',
        },
        correctChoice: 'B',
        sectionCode: 'C',
        tosCode: 'Section C · 1.8 Marcia Identity Formation',
        bloomsLevel: 'Applying',
        rationale:
          'Identity Foreclosure is characterized by high commitment without prior exploration (crisis). Jomar committed to Accountancy purely based on parental expectations without exploring alternatives.',
        optionRationales: {
          A: 'Not the answer in Jomar’s case because Moratorium requires active exploration of competing options without a final commitment, whereas Jomar has never explored other programs and is already settled on Accountancy.',
          B: 'Best fits the vignette because Jomar shows a firm commitment to Accountancy adopted directly from his CPA parents while explicitly lacking any personal exploration ("never explored other degree programs").',
          C: 'Only partially matches the lack of exploration in the stem—Diffusion requires having no commitment either, which is ruled out by Jomar’s clear commitment to the family auditing track.',
          D: 'Shares Jomar’s firm career commitment, but is ruled out because Achievement requires personally exploring alternatives first rather than adopting parental plans uncritically.',
        },
        adaptiveTips: {
          correctTip:
            'Both Foreclosure and Achievement feature a clear major commitment, and both Foreclosure and Diffusion feature zero exploration—Identity Foreclosure is the best answer because it is the only status combining Jomar’s unquestioned commitment to Accountancy with zero personal exploration of alternatives.',
          misconceptionTips: {
            A: 'Moratorium might seem tempting because Jomar is a 19-year-old college sophomore, an age when many students explore majors. However, the stem states he already enrolled in Accountancy and "feels no need to question" his parents’ plan—high commitment with zero exploration defines Identity Foreclosure.',
            C: 'Diffusion matches half of the stem (Jomar "never explored other degree programs"), making it a partial trap. Because Jomar already holds a definite commitment to Accountancy through his parents’ firm, Identity Foreclosure fits the full context.',
            D: 'Achievement matches Jomar’s clear commitment to Accountancy, making it a look-alike commitment trap. Achievement is ruled out because Jomar skipped personal exploration entirely and adopted his CPA parents’ plan directly—which defines Identity Foreclosure.',
          },
        },
      },
      {
        id: 'dev_q_2',
        stem: 'When Sofia’s mother receives a sudden mandatory night-shift schedule at her BPO company in Ortigas, she becomes sleep-deprived and less patient when helping 7-year-old Sofia with homework at home. In Bronfenbrenner’s Bioecological Model, the BPO company’s scheduling policy operates within Sofia’s:',
        options: {
          A: 'Microsystem',
          B: 'Mesosystem',
          C: 'Exosystem',
          D: 'Chronosystem',
        },
        correctChoice: 'C',
        sectionCode: 'C',
        tosCode: 'Section C · 1.5 Bronfenbrenner Ecological Model',
        bloomsLevel: 'Applying',
        rationale:
          'The Exosystem encompasses external settings that do not directly include the developing child (such as the parent’s workplace or employer policies) but indirectly influence the child’s immediate microsystem experience.',
        optionRationales: {
          A: 'Partial context trap: while homework help with her mother happens inside Sofia’s home Microsystem, the stem specifically asks where the BPO company’s scheduling policy operates—a workplace 7-year-old Sofia never directly enters.',
          B: 'Not the answer because a Mesosystem links two microsystems that both directly contain Sofia (e.g., her home and her school), whereas Sofia is not a direct participant in the Ortigas BPO office.',
          C: 'Best answer because the BPO workplace policy occurs in an external setting excluding Sofia directly, yet spills over into her home life through her mother’s sleep deprivation and reduced patience.',
          D: 'Not the answer here: although the night shift is "sudden," the question asks about the structural ecological layer of an employer’s policy rather than historical/sociohistorical or life-course transitions across time.',
        },
        adaptiveTips: {
          correctTip:
            'Even though the vignette mentions mother-child homework interaction at home, pay close attention to the exact subject of the question ("the BPO company’s scheduling policy"). Because Sofia does not participate in her mother’s workplace yet feels its indirect spillover at home, Exosystem is the most accurate answer over Microsystem or Mesosystem.',
          misconceptionTips: {
            A: 'Microsystem is tempting because the vignette ends with Sofia and her mother doing homework at home. However, the prompt asks specifically where "the BPO company’s scheduling policy" operates—since Sofia never enters that workplace directly, it belongs to her Exosystem.',
            B: 'Mesosystem is a close look-alike because two settings (workplace and home) are interacting. The crucial distinction in this vignette is that Sofia only belongs to one of those settings (home), whereas Mesosystem requires the child to participate directly in both settings.',
            D: 'Chronosystem can seem plausible due to the word "sudden" in the schedule change, but Chronosystem refers to life-course transitions or sociohistorical eras over time rather than indirect spillover from a parent’s employer policy (Exosystem).',
          },
        },
      },
      {
        id: 'dev_q_3',
        stem: 'A developmental researcher in Cebu wants to investigate age-related changes in executive functioning among Filipino adults aged 20, 40, and 60, while ruling out the confounding influence of generational differences in digital literacy. Which research design best accomplishes this goal?',
        options: {
          A: 'Cross-sectional design',
          B: 'Correlational case-control design',
          C: 'Sequential (cross-sequential) design',
          D: 'Microgenetic design',
        },
        correctChoice: 'C',
        sectionCode: 'B',
        tosCode: 'Section B · 2.2 Cross-Sectional vs. Longitudinal Studies',
        bloomsLevel: 'Analyzing',
        rationale:
          'A sequential design tracks multiple age cohorts over time, enabling researchers to disentangle true ontogenetic (age-related) changes from cohort/generational effects that confound simple cross-sectional studies.',
        optionRationales: {
          A: 'Only satisfies the first half of the stem (comparing ages 20, 40, and 60), but fails the explicit requirement to rule out generational/cohort differences in digital literacy.',
          B: 'Not the answer in this context because case-control studies compare groups with and without a pre-existing condition retrospectively rather than separating developmental aging from birth-cohort effects.',
          C: 'Best answer because following multiple adult age cohorts (20, 40, and 60) across repeated measurements allows the researcher to isolate true age-related executive changes from generational digital-literacy effects.',
          D: 'Not suited to this stem because microgenetic designs track moment-by-moment strategy change over a very brief span (days or weeks), not adult aging differences across 20-, 40-, and 60-year-old cohorts.',
        },
        adaptiveTips: {
          correctTip:
            'Cross-sectional design is a partial fit for comparing 20-, 40-, and 60-year-olds, but the stem adds a decisive second condition: "ruling out the confounding influence of generational differences in digital literacy." Sequential design is the best answer because only tracking multiple cohorts longitudinally separates age effects from cohort effects.',
          misconceptionTips: {
            A: 'Cross-sectional design is the classic partial-match trap here: it compares ages 20, 40, and 60 at one point in time, which leaves age completely confounded with generational digital literacy—violating the stem’s second requirement.',
            B: 'Case-control design compares clinical cases against matched controls on past exposures; it cannot separate developmental age changes across 20, 40, and 60 from generational cohort effects like a Sequential design does.',
            D: 'Microgenetic design intensively observes a rapid cognitive transition over a few sessions, which does not address multi-decade age comparisons (20, 40, 60) or generational digital-literacy confounds.',
          },
        },
      },
      {
        id: 'dev_q_4',
        stem: 'Four-year-old Lucas watches his older sister pour an equal amount of mango juice from a short, wide cup into a tall, slender glass. Lucas insists that the tall glass now has more juice. According to Piaget, Lucas’s error is primarily due to:',
        options: {
          A: 'Transductive reasoning and animism',
          B: 'Centration and lack of reversibility',
          C: 'Hypothetico-deductive failure',
          D: 'Object permanence deficit',
        },
        correctChoice: 'B',
        sectionCode: 'C',
        tosCode: 'Section C · 1.3 Piaget Cognitive Development',
        bloomsLevel: 'Applying',
        rationale:
          'In Piaget’s preoperational stage, children fail conservation of liquid tasks because of centration (focusing on one dimension—height—while ignoring width) and irreversibility (inability to mentally reverse the pouring action).',
        optionRationales: {
          A: 'Stage look-alike trap: although 4-year-old preoperational children do show animism and transductive reasoning, Lucas is neither attributing life to the glass nor linking two unrelated events—he is fixating on liquid height.',
          B: 'Best fits the mango juice task because Lucas centers solely on the taller height of the slender glass while ignoring its narrower width (centration) and cannot mentally pour the juice back to verify equality (irreversibility).',
          C: 'Not the answer because hypothetico-deductive reasoning belongs to adolescent formal operational hypothesis testing rather than a 4-year-old’s perceptual conservation error.',
          D: 'Not the answer because Lucas clearly sees and knows the mango juice still exists; object permanence pertains to hidden objects in infancy (sensorimotor stage), not conservation of volume.',
        },
        adaptiveTips: {
          correctTip:
            'Notice how Option A ("Transductive reasoning and animism") also belongs to Piaget’s preoperational stage for a 4-year-old. Centration and lack of reversibility is the best answer because it explains the exact mechanism behind misjudging liquid volume in a tall, slender glass rather than merely naming another preoperational trait.',
          misconceptionTips: {
            A: 'Transductive reasoning and animism belong to the same 2–7 preoperational age group as 4-year-old Lucas, making this a strong look-alike trap. However, nothing in the vignette involves lifelike objects or false cause-and-effect—failing liquid conservation specifically reflects centration on height and lack of reversibility.',
            C: 'Hypothetico-deductive reasoning refers to systematic scientific variable testing in Piaget’s formal operational stage, whereas 4-year-old Lucas is failing a classic preoperational liquid conservation task due to centration and irreversibility.',
            D: 'Object permanence is about knowing an out-of-sight object still exists in infancy. Here, the mango juice remains in plain view the entire time—Lucas’s mistake is judging quantity by height alone (centration) without mentally reversing the pour.',
          },
        },
      },
      {
        id: 'dev_q_5',
        stem: 'During which prenatal period is the developing organism most vulnerable to major structural anomalies (congenital malformations) caused by teratogens such as rubella or thalidomide?',
        options: {
          A: 'Germinal stage (conception to 2 weeks)',
          B: 'Embryonic stage (2 to 8 weeks)',
          C: 'Early fetal stage (9 to 16 weeks)',
          D: 'Late fetal stage (24 to 38 weeks)',
        },
        correctChoice: 'B',
        sectionCode: 'E',
        tosCode: 'Section E · 1.1 Prenatal Heredity & Environmental Influences',
        bloomsLevel: 'Understanding',
        rationale:
          'Organogenesis—the rapid differentiation of major body organs and nervous, respiratory, and digestive systems—occurs during the embryonic period (weeks 2 to 8), making it the critical window of highest vulnerability to structural teratogenic damage.',
        optionRationales: {
          A: 'Not the answer for structural malformations: teratogenic insult in the first 2 weeks prior to or during implantation typically produces an all-or-none survival outcome (spontaneous miscarriage or intact recovery) rather than specific organ defects.',
          B: 'Best answer because major organs and limbs rapidly form (organogenesis) during weeks 2 to 8, directly matching the stem’s emphasis on "major structural anomalies" from rubella or thalidomide.',
          C: 'Partial trap: teratogens still harm the fetus during weeks 9 to 16, but because foundational organ structures are already laid down, damage shifts mainly to physiological/CNS functioning or minor defects rather than major congenital malformations.',
          D: 'Not the answer because exposure in weeks 24 to 38 primarily affects fetal growth rate, birth weight, and central nervous system maturation rather than causing gross structural organ malformations.',
        },
        adaptiveTips: {
          correctTip:
            'Teratogens are harmful across pregnancy, making the fetal stages partially tempting—but the stem specifically asks when the organism is MOST vulnerable to "major structural anomalies" (like thalidomide limb defects or rubella heart/eye defects). Because primary organogenesis occurs in weeks 2–8, the Embryonic stage is unequivocally the best answer.',
          misconceptionTips: {
            A: 'While the Germinal stage is the earliest period, cells have not yet differentiated into specific organs; severe teratogen exposure at 0–2 weeks usually prevents implantation altogether rather than producing the structural malformations specified in the stem.',
            C: 'Teratogens certainly remain dangerous in the Early fetal stage (9–16 weeks), but major organ structures have already formed during weeks 2–8—so fetal exposure mainly causes functional/physiological deficits rather than major structural malformations.',
            D: 'In the Late fetal stage (24–38 weeks), major body structures are already formed; teratogens at this point typically restrict growth or affect brain/behavioral functioning rather than causing congenital structural anomalies.',
          },
        },
      },
    ],
  },

  psych_assessment: {
    id: 'psych_assessment',
    shortTitle: 'Psych Assessment',
    fullTitle: 'Psychological Assessment',
    officialTosSubjectHeader: 'Annex "B" · Psychological Assessment/Psychometrician (As of February 2023 · PQF Level 6)',
    officialPdfPageRange: 'Pages 14–16',
    officialPdfStartPage: 14,
    weightPercent: 40,
    totalBoardItems: 130,
    examDurationMinutes: 180,
    bloomsDistributionSummary:
      'Easy 30% (19 Rem [15%] · 20 Und [15%]) · Moderate 40% (52 App [40%]) · Difficult 30% (19 Ana [15%] · 19 Eva [14%] · 1 Cre [1%])',
    referenceTextbooks: 'Cohen & Swerdlik (Psychological Testing and Assessment), Kaplan & Saccuzzo, PAP Code of Ethics',
    sections: [
      {
        id: 'pa_A',
        sectionLetter: 'A',
        title: 'Psychometric Properties and Principles',
        weightPercent: 30,
        itemCount: 39,
        competencies: [
          {
            id: 'pa_A_1',
            code: '1',
            description: 'Ascertain psychometric properties essential in: a. constructing (2), b. selecting (1), c. interpreting tests (2)',
            itemCount: 5,
            bloomsBreakdown: '5 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'pa_A_2',
            code: '2',
            description: 'Describe the value of different psychometric properties and principles',
            itemCount: 5,
            bloomsBreakdown: '5 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'pa_A_3',
            code: '3',
            description: 'Justify the reason for accepting or rejecting instruments and tools based on psychometric properties',
            itemCount: 9,
            bloomsBreakdown: '9 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'pa_A_4',
            code: '4',
            description: 'Manifest capacity to interpret and utilize test results based on the psychometric properties of the assessment instrument',
            itemCount: 9,
            bloomsBreakdown: '9 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'pa_A_5',
            code: '5',
            description: 'Examine the ways psychometric principles are applied in (a) interpretation of results [3] and (b) usage of assessment outcomes [3]',
            itemCount: 6,
            bloomsBreakdown: '6 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'pa_A_6',
            code: '6',
            description: 'Evaluate the application of psychometric principles in the development of assessment instruments',
            itemCount: 5,
            bloomsBreakdown: '5 Evaluating',
            primaryBlooms: 'Evaluating',
          },
        ],
      },
      {
        id: 'pa_B',
        sectionLetter: 'B',
        title: 'Research Methods and Statistics',
        weightPercent: 15,
        itemCount: 20,
        competencies: [
          {
            id: 'pa_B_1',
            code: '1',
            description: 'Recognize statistics applied in research studies on tests and test development',
            itemCount: 3,
            bloomsBreakdown: '3 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'pa_B_2',
            code: '2',
            description: 'Explain (a) methods [1] and (b) statistics [2] used in research studies and test construction',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'pa_B_3',
            code: '3',
            description: 'Apply the appropriate research methods and statistics in test (a) development [4] and (b) standardization [4]',
            itemCount: 8,
            bloomsBreakdown: '8 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'pa_B_4',
            code: '4',
            description: 'Analyze the research and statistical methods applied in (a) test development [1], (b) test standardization [1], and (c) studies on tests and their findings [1]',
            itemCount: 3,
            bloomsBreakdown: '3 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'pa_B_5',
            code: '5',
            description: 'Appraise the appropriateness of the statistics and methods of research applied for a given goal',
            itemCount: 3,
            bloomsBreakdown: '3 Evaluating',
            primaryBlooms: 'Evaluating',
          },
        ],
      },
      {
        id: 'pa_C',
        sectionLetter: 'C',
        title: 'Uses, Benefits, Limitations of Assessment Tools and Instruments',
        weightPercent: 10,
        itemCount: 13,
        competencies: [
          {
            id: 'pa_C_1',
            code: '1',
            description: 'State purposes of given assessment (a) Methods [1] and (b) Tools [1]',
            itemCount: 2,
            bloomsBreakdown: '2 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'pa_C_2',
            code: '2',
            description: 'Describe benefits derived from different assessment (a) Methods [1] and (b) Tools [2]',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'pa_C_3',
            code: '3',
            description: 'Determine appropriate selection tools for given populations and settings',
            itemCount: 4,
            bloomsBreakdown: '4 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'pa_C_4',
            code: '4',
            description: 'Analyze the strengths and limitations of assessment tools',
            itemCount: 2,
            bloomsBreakdown: '2 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'pa_C_5',
            code: '5',
            description: 'Assess the appropriateness of selected assessment tools and instruments',
            itemCount: 2,
            bloomsBreakdown: '2 Evaluating',
            primaryBlooms: 'Evaluating',
          },
        ],
      },
      {
        id: 'pa_D',
        sectionLetter: 'D',
        title: 'Selection of Assessment Methods and Tools',
        weightPercent: 15,
        itemCount: 19,
        competencies: [
          {
            id: 'pa_D_1',
            code: '1',
            description: 'Identify appropriate assessment (a) methods [1] and (b) tools [1] for specific purposes',
            itemCount: 2,
            bloomsBreakdown: '2 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'pa_D_2',
            code: '2',
            description: 'Clarify rationale for selecting (a) assessment methods [1] and (b) tools for specific populations and purposes [2]',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'pa_D_3',
            code: '3',
            description: 'Specify areas of assessment and/or tools needed for (a) specific populations [3], (b) settings [2], and (c) circumstances [2]',
            itemCount: 7,
            bloomsBreakdown: '7 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'pa_D_4',
            code: '4',
            description: 'Determine the best assessment methods and/or tools for (a) Individuals [2] and (b) Groups [1]',
            itemCount: 3,
            bloomsBreakdown: '3 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'pa_D_5',
            code: '5',
            description: 'Evaluate whether selected methods and instruments yield the needed information',
            itemCount: 3,
            bloomsBreakdown: '3 Evaluating',
            primaryBlooms: 'Evaluating',
          },
          {
            id: 'pa_D_6',
            code: '6',
            description: 'Recommend methods and instruments required for specific needs and goals',
            itemCount: 1,
            bloomsBreakdown: '1 Creating',
            primaryBlooms: 'Creating',
          },
        ],
      },
      {
        id: 'pa_E',
        sectionLetter: 'E',
        title: 'Test Administration, Scoring, Interpretation and Usage',
        weightPercent: 15,
        itemCount: 20,
        competencies: [
          {
            id: 'pa_E_1',
            code: '1',
            description: 'Detect errors in test (a) selection [1], (b) administration [1], and (c) scoring [1]',
            itemCount: 3,
            bloomsBreakdown: '3 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'pa_E_2',
            code: '2',
            description: 'Show recognition of impact of errors in test (a) administration [1], (b) scoring [1], and (c) interpretation [1]',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'pa_E_3',
            code: '3',
            description: 'Respond appropriately to challenges in test (a) usage [2], (b) administration [2], (c) scoring [2], and (d) interpretation [2]',
            itemCount: 8,
            bloomsBreakdown: '8 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'pa_E_4',
            code: '4',
            description: 'Explore anomaly in test (a) administration [1], (b) interpretation [1], and (c) usage [1]',
            itemCount: 3,
            bloomsBreakdown: '3 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'pa_E_5',
            code: '5',
            description: 'Appraise usefulness of tests under varying conditions of test administration, scoring, and interpretation',
            itemCount: 3,
            bloomsBreakdown: '3 Evaluating',
            primaryBlooms: 'Evaluating',
          },
        ],
      },
      {
        id: 'pa_F',
        sectionLetter: 'F',
        title: 'Ethical Principles and Standards of Practice',
        weightPercent: 15,
        itemCount: 19,
        competencies: [
          {
            id: 'pa_F_1',
            code: '1',
            description: 'Identify ethical principles that pertain to test (a) Interpretation [2] and (b) Usage [2]',
            itemCount: 4,
            bloomsBreakdown: '4 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'pa_F_2',
            code: '2',
            description: 'Expound on what makes a situation or activity a violation of ethics and standard of good practice',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'pa_F_3',
            code: '3',
            description: 'Appropriately handle different situations that may challenge the application of ethical principles and standards',
            itemCount: 7,
            bloomsBreakdown: '7 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'pa_F_4',
            code: '4',
            description: 'Explore the different possibilities for avoiding ethical violations',
            itemCount: 2,
            bloomsBreakdown: '2 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'pa_F_5',
            code: '5',
            description: 'Evaluate ethical appropriateness of the way psychometric matters had been handled',
            itemCount: 3,
            bloomsBreakdown: '3 Evaluating',
            primaryBlooms: 'Evaluating',
          },
        ],
      },
    ],
    seedFlashcards: [
      {
        id: 'pa_fc_1',
        term: 'Standard Error of Measurement (SEM) vs. Standard Error of Estimate (SEE)',
        definition:
          'SEM = SD * sqrt(1 - r_xx). Used to construct a confidence interval around an examinee’s observed score to estimate their true score. SEE = SD_y * sqrt(1 - r_xy^2). Used in regression/validity to estimate the margin of error when predicting a criterion score (Y) from a test score (X).',
        tosCode: 'Section A · 4 Interpret & Utilize Test Results',
        bloomsLevel: 'Applying',
        status: 'unseen',
      },
      {
        id: 'pa_fc_2',
        term: 'KR-20 vs. KR-21 vs. Cronbach’s Coefficient Alpha',
        definition:
          'KR-20: Internal consistency for dichotomous items (right/wrong) of varying difficulty. KR-21: Approximation assuming all dichotomous items have equal difficulty. Cronbach’s Alpha: Used for polytomous/multipoint scales (e.g., Likert 1–5 items).',
        tosCode: 'Section B · 3 Statistics in Test Development',
        bloomsLevel: 'Applying',
        status: 'unseen',
      },
      {
        id: 'pa_fc_3',
        term: 'MTMM (Multitrait-Multimethod Matrix by Campbell & Fiske)',
        definition:
          'Evaluates construct validity simultaneously examining Convergent Validity (high correlations among different methods measuring the same trait: monotrait-heteromethod) and Discriminant/Divergent Validity (low correlations among the same method measuring different traits: heterotrait-monomethod).',
        tosCode: 'Section A · 6 Psychometric Principles in Test Development',
        bloomsLevel: 'Evaluating',
        status: 'unseen',
      },
      {
        id: 'pa_fc_4',
        term: 'Test Data vs. Test Materials (PAP Code of Ethics)',
        definition:
          'Test Data refers to a client’s raw and scaled scores, client responses, and notes taken during administration (generally released to the client/legal representative upon written request unless contraindicative). Test Materials refer to manuals, instruments, protocols, and test questions (protected to preserve test security and copyright).',
        tosCode: 'Section F · 3 PAP Code of Ethics in Assessment',
        bloomsLevel: 'Applying',
        status: 'unseen',
      },
      {
        id: 'pa_fc_5',
        term: 'Stanine, Sten, and T-Score Conversions',
        definition:
          'Z-score: Mean = 0, SD = 1.\nT-score: Mean = 50, SD = 10 (T = 50 + 10z).\nStanine: Mean = 5, SD ≈ 2 (range 1 to 9).\nSten: Mean = 5.5, SD = 2 (range 1 to 10).\nDeviation IQ (Wechsler): Mean = 100, SD = 15.',
        tosCode: 'Section B · 3 Test Standardization & Norms',
        bloomsLevel: 'Applying',
        status: 'unseen',
      },
    ],
    seedQuestions: [
      {
        id: 'pa_q_1',
        stem: 'A newly licensed Registered Psychometrician (RPm) administers a standardized cognitive ability test with a mean of 100, a standard deviation of 15, and a reliability coefficient (r_xx) of 0.91. If an examinee obtains an observed score of 115, what is the 95% confidence interval for the examinee’s true score?',
        options: {
          A: '110.5 to 119.5',
          B: '106.18 to 123.82',
          C: '100.0 to 130.0',
          D: '112.0 to 118.0',
        },
        correctChoice: 'B',
        sectionCode: 'A',
        tosCode: 'Section A · 4 Interpret & Utilize Test Results (SEM)',
        bloomsLevel: 'Applying',
        rationale:
          'First compute SEM = SD * sqrt(1 - r_xx) = 15 * sqrt(1 - 0.91) = 15 * 0.3 = 4.5. For a 95% confidence interval, multiply SEM by ±1.96 (4.5 * 1.96 = 8.82), yielding 115 ± 8.82 = 106.18 to 123.82.',
        optionRationales: {
          A: 'Partial calculation trap: correctly computes SEM = 4.5 and centers on 115, but stops at ±1 SEM (68% confidence interval: 115 ± 4.5) instead of scaling to the 95% confidence level (±1.96 SEM) asked in the stem.',
          B: 'Best answer because it applies both required steps in the stem: computing SEM = 15 × √(1 − 0.91) = 4.5 and multiplying by ±1.96 (±8.82) around the observed score of 115 for a 95% confidence interval.',
          C: 'Not the answer because 115 ± 15 uses the raw test SD (15) directly as the margin of error, ignoring the test’s high reliability coefficient (0.91).',
          D: 'Not the answer because ±3.0 understates the error band (even smaller than 1 SEM = 4.5), failing to reflect 1.96 × SEM around 115.',
        },
        adaptiveTips: {
          correctTip:
            'Option A (110.5 to 119.5) is a classic partial-step trap because 4.5 IS the exact SEM here—but ±1 SEM only covers 68% confidence. Multiplying 4.5 by 1.96 (±8.82) is what makes 106.18 to 123.82 the exact match for the stem’s 95% confidence requirement.',
          misconceptionTips: {
            A: 'You calculated SEM = 4.5 accurately! The reason 110.5 to 119.5 falls short is that 115 ± 4.5 represents the 68% confidence interval (±1 SEM), whereas the stem specifically asks for the 95% confidence interval (115 ± 1.96 × 4.5 = 106.18 to 123.82).',
            C: '100.0 to 130.0 adds and subtracts the full SD (15) around 115 without factoring in the reliability of 0.91. First shrink SD using SEM = 15 × √(1 − 0.91) = 4.5, then multiply by 1.96 for 95% confidence.',
            D: '112.0 to 118.0 (±3) is narrower than even a single SEM (4.5). With SD = 15 and r_xx = 0.91, SEM is 4.5 and the 95% margin of error is 1.96 × 4.5 = ±8.82 (106.18 to 123.82).',
          },
        },
      },
      {
        id: 'pa_q_2',
        stem: 'A local university is developing a 60-item Filipino Resilience Scale where respondents rate each statement from 1 (Strongly Disagree) to 5 (Strongly Agree). The test developers believe resilience comprises three distinct sub-dimensions: Emotional Regulation, Kapwa Support, and Adaptive Coping. Which combination of statistical procedures is most appropriate to evaluate internal consistency and verify the hypothesized three-factor structure?',
        options: {
          A: 'Kuder-Richardson 20 (KR-20) and Point-Biserial Correlation',
          B: 'Cronbach’s Alpha and Confirmatory Factor Analysis (CFA)',
          C: 'Spearman-Brown Split-Half and Chi-Square Test of Independence',
          D: 'Cohen’s Kappa and Multidimensional Scaling',
        },
        correctChoice: 'B',
        sectionCode: 'B',
        tosCode: 'Section B · 3 Research Methods & Statistics in Test Development',
        bloomsLevel: 'Applying',
        rationale:
          'Cronbach’s Alpha is the appropriate internal consistency measure for polytomous (1–5 Likert) items, while Confirmatory Factor Analysis (CFA) tests whether empirical data fit an a priori hypothesized factor structure (three specific sub-dimensions).',
        optionRationales: {
          A: 'Look-alike reliability trap: KR-20 also measures internal consistency, but only for dichotomous (right/wrong) items rather than the stem’s 1-to-5 Likert scale, and Point-Biserial does not test a three-factor structure.',
          B: 'Best answer because Cronbach’s Alpha matches polytomous 1–5 Likert ratings AND Confirmatory Factor Analysis directly tests the developers’ pre-specified three-subdimension theory.',
          C: 'Not the best fit: Split-Half only correlates two test halves rather than all 60 Likert items simultaneously, and Chi-Square tests categorical contingency tables rather than latent factor structure.',
          D: 'Not applicable to this context: Cohen’s Kappa evaluates categorical inter-rater agreement between judges rather than respondent Likert consistency, and MDS maps similarity spaces rather than confirming a hypothesized 3-factor model.',
        },
        adaptiveTips: {
          correctTip:
            'Two contextual details in the stem lock in [B] together: (1) items are rated 1-to-5 polytomous Likert (requiring Cronbach’s Alpha over dichotomous KR-20), and (2) the developers already specified three named sub-dimensions in advance (requiring Confirmatory rather than purely exploratory or bivariate methods).',
          misconceptionTips: {
            A: 'KR-20 is a close internal-consistency look-alike, which makes [A] tempting—but KR-20 applies only to binary (0/1) achievement items, not a 1-to-5 Likert scale, and Point-Biserial item correlation cannot verify a 3-factor model like CFA does.',
            C: 'While Spearman-Brown Split-Half estimates reliability, Cronbach’s Alpha is superior for multipoint Likert scales, and Chi-Square tests nominal frequency independence rather than confirming three latent resilience dimensions.',
            D: 'Cohen’s Kappa measures agreement between raters classifying categories, whereas this stem involves self-report 1–5 Likert ratings and testing an a priori three-factor model (Cronbach’s Alpha + CFA).',
          },
        },
      },
      {
        id: 'pa_q_3',
        stem: 'An HR Director asks the company’s Registered Psychometrician for copies of the actual test booklet items and scoring keys of a copyrighted personality inventory so the managers can review the questions during panel interviews. Under the PAP Code of Ethics and RA 10029, how should the RPm respond?',
        options: {
          A: 'Provide the test booklets and keys immediately since the company paid for the test kits.',
          B: 'Decline to release the test questions and scoring keys to non-qualified personnel to maintain test security and integrity, and offer a summary of the measured constructs instead.',
          C: 'Photocopy only the items that the applicant answered unfavorably and attach them to the HR file.',
          D: 'Allow the managers to take the test booklets home as long as they sign a non-disclosure memo.',
        },
        correctChoice: 'B',
        sectionCode: 'F',
        tosCode: 'Section F · 3 Ethical Principles & PAP Code of Ethics',
        bloomsLevel: 'Applying',
        rationale:
          'Under the PAP Code of Ethics (Assessment), psychologists and psychometricians must maintain the integrity and security of restricted test materials (manuals, protocols, test items, scoring keys) and must not release them to unqualified individuals.',
        optionRationales: {
          A: 'Not the answer because corporate purchase of test kits does not override the RPm’s statutory and ethical duty to restrict copyrighted test items and scoring keys from unqualified non-psychometricians.',
          B: 'Best answer because it protects restricted test materials (booklets and scoring keys) from exposure to untrained panel managers while constructively addressing HR’s hiring need via a plain-language construct summary.',
          C: 'Violates both copyright/test security (reproducing copyrighted items) and ethical assessment standards (exposing isolated raw item responses out of context in general HR files).',
          D: 'Partial safeguard trap: an internal NDA does not make untrained panel managers qualified to handle restricted psychological test items and scoring keys, nor does it permit taking secure materials home.',
        },
        adaptiveTips: {
          correctTip:
            'The stem distinguishes restricted "test materials" (actual copyrighted booklet questions and scoring keys) from legitimate assessment feedback for hiring managers. [B] is the best answer because it upholds strict test security while still giving the panel usable construct-level insights—unlike [D], where a homemade NDA still releases restricted materials to unqualified staff.',
          misconceptionTips: {
            A: 'Even though the company paid for the inventory, financial ownership never authorizes releasing restricted test booklets and scoring keys to non-qualified managers—doing so invalidates future administrations and breaches the PAP Code of Ethics.',
            C: 'Releasing only "unfavorable" photocopied items still breaches copyright and test security, and invites misinterpretation of single personality items by non-psychometricians.',
            D: 'Signing an NDA sounds like a reasonable workplace compromise, making [D] a realistic trap—but under the PAP Code of Ethics and RA 10029, non-qualified personnel cannot possess scoring keys or take test booklets home regardless of an internal memo.',
          },
        },
      },
      {
        id: 'pa_q_4',
        stem: 'During item analysis of an achievement test, Item #24 shows an item difficulty index (p) of 0.12 and an item discrimination index (d) of -0.25. How should the test developer evaluate Item #24?',
        options: {
          A: 'Retain the item as is because it effectively separates high and low scorers.',
          B: 'Revise or discard the item because it is very difficult and low-scoring examinees answered it correctly more often than high-scoring examinees.',
          C: 'Move the item to the beginning of the test as a warm-up item because it is very easy.',
          D: 'Retain the item because negative discrimination increases KR-20 reliability.',
        },
        correctChoice: 'B',
        sectionCode: 'A',
        tosCode: 'Section A · 3 Justify Accepting or Rejecting Instruments/Items',
        bloomsLevel: 'Evaluating',
        rationale:
          'An item difficulty (p) of 0.12 indicates only 12% of examinees got it right (very difficult), and a negative discrimination index (d = -0.25) indicates that lower-performing examinees outperformed higher-performing examinees on this item—often due to a miskeyed answer or ambiguous distractor.',
        optionRationales: {
          A: 'Sign-error trap: while 0.25 in magnitude indicates separation, the minus sign (−0.25) means the item separates groups in the wrong direction—penalizing top scorers and rewarding low scorers.',
          B: 'Best answer because it accurately interprets both indices in the stem: p = 0.12 means only 12% answered correctly (very difficult), and d = −0.25 means low scorers beat high scorers, requiring revision or removal.',
          C: 'Inverts the item difficulty index: p is the proportion passing, so p = 0.12 is very difficult (only 12% passed), the opposite of an easy warm-up item (such as p = 0.85+).',
          D: 'Psychometrically false in this context: negatively discriminating items work against the total test score and actively lower internal consistency (KR-20), so retaining Item #24 harms test reliability.',
        },
        adaptiveTips: {
          correctTip:
            'Item #24 fails on both indices in the stem—p = 0.12 means 88% missed it (remember higher p = easier item), and d = −0.25 means high-overall examinees were disproportionately misled (classic sign of a miskeyed option or trick wording), making revision or removal the only sound decision.',
          misconceptionTips: {
            A: 'You noticed |d| = 0.25 shows a difference between upper and lower groups, but overlooked the negative sign (−0.25). Negative discrimination means top students got Item #24 wrong more often than low scorers, so it must be revised or discarded.',
            C: 'It is easy to confuse "difficulty index" with how hard an item is, but p actually represents the proportion who got the item RIGHT. Thus p = 0.12 means only 12% got it right (very hard, not an easy warm-up), and d = −0.25 requires revising or discarding it.',
            D: 'Negative item discrimination (−0.25) means Item #24 correlates negatively with the rest of the test, which reduces—never increases—KR-20 internal consistency.',
          },
        },
      },
      {
        id: 'pa_q_5',
        stem: 'A student obtained a raw score that corresponds to a T-score of 60 on a standardized mechanical aptitude test. Assuming a normal distribution, what is this student’s equivalent z-score and approximate percentile rank?',
        options: {
          A: 'z = +1.00; 84th percentile',
          B: 'z = +2.00; 98th percentile',
          C: 'z = +0.50; 69th percentile',
          D: 'z = -1.00; 16th percentile',
        },
        correctChoice: 'A',
        sectionCode: 'B',
        tosCode: 'Section B · 3 Standardization & Derived Scores',
        bloomsLevel: 'Applying',
        rationale:
          'T-scores have a mean of 50 and an SD of 10. A T-score of 60 is 1 SD above the mean (z = +1.00). In a standard normal distribution, z = +1.00 corresponds to approximately the 84th percentile (50% + 34.13%).',
        optionRationales: {
          A: 'Best answer because T = 50 + 10z gives z = (60 − 50) / 10 = +1.00, and 1 SD above the mean in a normal curve falls at ~84th percentile (50% below the mean + 34.13% between 0 and +1 SD).',
          B: 'Internally consistent pair (z = +2.00 really is the 98th percentile), making it a polished look-alike, but it corresponds to a T-score of 70 rather than the stem’s T-score of 60.',
          C: 'Internally consistent pair (z = +0.50 really is ~69th percentile), but it corresponds to a T-score of 55—often chosen if one mistakenly divides (60 − 50) by an SD of 20 instead of 10.',
          D: 'Direction-reversal trap: gets the 1-SD distance from 50 right, but treats 60 as below the mean (z = −1.00, 16th percentile actually corresponds to T = 40).',
        },
        adaptiveTips: {
          correctTip:
            'Notice that every single option pairs a mathematically matching z-score and percentile (e.g., +2.00 really is 98th, +0.50 really is 69th)—so you cannot eliminate options by z-to-percentile mismatch alone. Converting T = 60 using Mean = 50 and SD = 10 ((60 − 50)/10 = +1.00) is what singles out [A].',
          misconceptionTips: {
            B: 'While z = +2.00 does equal the 98th percentile, T-scores have Mean = 50 and SD = 10—so z = +2.00 would require T = 70. A T-score of 60 is exactly 10 points (1 SD) above 50, giving z = +1.00 (84th percentile).',
            C: 'z = +0.50 (69th percentile) would correspond to T = 55, or comes from using SD = 20 instead of T-score’s fixed SD = 10. Since T = 50 + 10z, T = 60 yields z = +1.00 (84th percentile).',
            D: 'You identified the 1-SD distance from the mean of 50, but reversed the sign: because 60 is ABOVE the T-score mean of 50, z is +1.00 (84th percentile), whereas z = −1.00 (16th percentile) describes T = 40.',
          },
        },
      },
    ],
  },

  abnormal_psych: {
    id: 'abnormal_psych',
    shortTitle: 'Abnormal Psych',
    fullTitle: 'Abnormal Psychology',
    officialTosSubjectHeader: 'Annex "B" · Board for Psychometrician (As of February 2023 · PQF Level 6)',
    officialPdfPageRange: 'Pages 17–19',
    officialPdfStartPage: 17,
    weightPercent: 20,
    totalBoardItems: 100,
    examDurationMinutes: 180,
    bloomsDistributionSummary:
      'Easy 30% (15 Rem · 15 Und) · Moderate 40% (40 App) · Difficult 30% (15 Ana · 15 Eva)',
    referenceTextbooks: 'Barlow & Durand (Abnormal Psychology), DSM-5, RA 11036 Philippine Mental Health Act',
    sections: [
      {
        id: 'abn_A',
        sectionLetter: 'A',
        title: 'Manifestations of Behavior',
        weightPercent: 5,
        itemCount: 5,
        competencies: [
          {
            id: 'abn_A_1_1',
            code: '1.1',
            description: 'Recognize normal and abnormal manifestations of behavior',
            itemCount: 3,
            bloomsBreakdown: '3 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'abn_A_1_2',
            code: '1.2',
            description: 'Assess abnormal manifestations of behaviors based on the social contexts',
            itemCount: 2,
            bloomsBreakdown: '2 Evaluating',
            primaryBlooms: 'Evaluating',
          },
        ],
      },
      {
        id: 'abn_B',
        sectionLetter: 'B',
        title: 'Psychological Disorders and Specific Symptoms based on DSM-5',
        weightPercent: 50,
        itemCount: 50,
        competencies: [
          {
            id: 'abn_B_1_1',
            code: '1.1',
            description: 'Differentiate Anxiety Disorders from other psychological disorders',
            itemCount: 5,
            bloomsBreakdown: '5 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'abn_B_1_2',
            code: '1.2',
            description: 'Differentiate Trauma-and-Stressor Related Disorders from other psychological disorders',
            itemCount: 4,
            bloomsBreakdown: '4 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'abn_B_1_3',
            code: '1.3',
            description: 'Differentiate Obsessive-Compulsive Related Disorders from other psychological disorders',
            itemCount: 4,
            bloomsBreakdown: '4 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'abn_B_1_4',
            code: '1.4',
            description: 'Explain Somatic Symptom and Related Disorders from other disorders',
            itemCount: 4,
            bloomsBreakdown: '4 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'abn_B_1_5',
            code: '1.5',
            description: 'Evaluate Dissociative Disorder from other psychological disorders',
            itemCount: 3,
            bloomsBreakdown: '3 Evaluating',
            primaryBlooms: 'Evaluating',
          },
          {
            id: 'abn_B_1_6',
            code: '1.6',
            description: 'Illustrate Depressive Disorders from other psychological disorders',
            itemCount: 5,
            bloomsBreakdown: '5 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'abn_B_1_7',
            code: '1.7',
            description: 'Explain Eating and Sleep Disorder from other disorders',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'abn_B_1_8',
            code: '1.8',
            description: 'Evaluate the different Sexual Dysfunctions, Paraphilic Disorders and Gender Dysphoria',
            itemCount: 2,
            bloomsBreakdown: '2 Evaluating',
            primaryBlooms: 'Evaluating',
          },
          {
            id: 'abn_B_1_9',
            code: '1.9',
            description: 'Explain Substance-Related and Addictive Disorder from other psychological disorders',
            itemCount: 2,
            bloomsBreakdown: '2 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'abn_B_1_10',
            code: '1.10',
            description: 'Explain Impulse Control Disorders from other disorders',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'abn_B_1_11',
            code: '1.11',
            description: 'Illustrate the different Personality Disorders and with the other psychopathologies of personalities',
            itemCount: 5,
            bloomsBreakdown: '5 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'abn_B_1_12',
            code: '1.12',
            description: 'Illustrate Schizophrenia and Other Psychotic Disorders from other psychological disorders',
            itemCount: 5,
            bloomsBreakdown: '5 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'abn_B_1_13',
            code: '1.13',
            description: 'Identify the different Neurodevelopmental Disorders based on DSM-5',
            itemCount: 3,
            bloomsBreakdown: '3 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'abn_B_1_14',
            code: '1.14',
            description: 'Identify the different Neurocognitive Disorders based on DSM-5',
            itemCount: 2,
            bloomsBreakdown: '2 Remembering',
            primaryBlooms: 'Remembering',
          },
        ],
      },
      {
        id: 'abn_C',
        sectionLetter: 'C',
        title: 'Theoretical Approaches in Explaining the Etiology of Psychological Disorders',
        weightPercent: 20,
        itemCount: 20,
        competencies: [
          {
            id: 'abn_C_1_1',
            code: '1.1',
            description: 'Illustrate the genetic contributions in the development of mental disorders',
            itemCount: 4,
            bloomsBreakdown: '4 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'abn_C_1_2',
            code: '1.2',
            description: 'Illustrate the role of biological and neurological bases in the development of psychological disorders',
            itemCount: 4,
            bloomsBreakdown: '4 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'abn_C_1_3',
            code: '1.3',
            description: 'Illustrate the role of learning in the development of psychological disorders',
            itemCount: 4,
            bloomsBreakdown: '4 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'abn_C_1_4',
            code: '1.4',
            description: 'Explain the cognitive theories in the development of psychological disorders',
            itemCount: 2,
            bloomsBreakdown: '2 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'abn_C_1_5',
            code: '1.5',
            description: 'Attribute the diathesis-stress model in the development of psychological disorders',
            itemCount: 3,
            bloomsBreakdown: '3 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'abn_C_1_6',
            code: '1.6',
            description: 'Analyze the role of gene-environment interaction in the development of psychological disorders',
            itemCount: 2,
            bloomsBreakdown: '2 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'abn_C_1_7',
            code: '1.7',
            description: 'Assess the role of culture, social interactions, and interpersonal factors in the development of psychological disorders',
            itemCount: 1,
            bloomsBreakdown: '1 Evaluating',
            primaryBlooms: 'Evaluating',
          },
        ],
      },
      {
        id: 'abn_D',
        sectionLetter: 'D',
        title: 'Therapeutic Interventions of Psychological Disorders',
        weightPercent: 10,
        itemCount: 10,
        competencies: [
          {
            id: 'abn_D_1_1',
            code: '1.1',
            description: 'Explain the different psychological interventions used for the treatment of psychological disorders',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'abn_D_1_2',
            code: '1.2',
            description: 'Illustrate the application of psychological interventions for the treatment of psychological disorders',
            itemCount: 5,
            bloomsBreakdown: '5 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'abn_D_1_3',
            code: '1.3',
            description: 'Evaluate the efficacy of the psychological interventions for the treatment of psychological disorders',
            itemCount: 2,
            bloomsBreakdown: '2 Evaluating',
            primaryBlooms: 'Evaluating',
          },
        ],
      },
      {
        id: 'abn_E',
        sectionLetter: 'E',
        title: 'Socio-cultural Factors and Ethical Principles in Diagnosing Cases of Abnormal Behavior',
        weightPercent: 5,
        itemCount: 5,
        competencies: [
          {
            id: 'abn_E_1_1',
            code: '1.1',
            description: 'Identify socio-cultural factors that may impact diagnosing of mental disorders',
            itemCount: 2,
            bloomsBreakdown: '2 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'abn_E_2_1',
            code: '2.1',
            description: 'Apply appropriate ethical principles and standards of practice in diagnosing abnormal behavior',
            itemCount: 3,
            bloomsBreakdown: '3 Applying',
            primaryBlooms: 'Applying',
          },
        ],
      },
      {
        id: 'abn_F',
        sectionLetter: 'F',
        title: 'Global Health Crisis and Mental Health Law',
        weightPercent: 10,
        itemCount: 10,
        competencies: [
          {
            id: 'abn_F_1_1',
            code: '1.1',
            description: 'Recognize the different Issues and concerns in various settings (educational, occupational, community) on the impact of (COVID-19) on the mental health condition of people and the challenges of the implementation of RA11036',
            itemCount: 5,
            bloomsBreakdown: '5 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'abn_F_1_2',
            code: '1.2',
            description: 'Evaluate the impact of global health crisis (COVID-19) and other mental health conditions on the implementation of RA11036',
            itemCount: 5,
            bloomsBreakdown: '5 Evaluating',
            primaryBlooms: 'Evaluating',
          },
        ],
      },
    ],
    seedFlashcards: [
      {
        id: 'abn_fc_1',
        term: 'Schizophrenia Spectrum Duration Timeline (DSM-5-TR)',
        definition:
          '• Brief Psychotic Disorder: 1 day to less than 1 month (full return to premorbid functioning).\n• Schizophreniform Disorder: At least 1 month to less than 6 months.\n• Schizophrenia: Continuous signs for at least 6 months (including at least 1 month of active-phase symptoms).',
        tosCode: 'Section B · 1.12 Schizophrenia Spectrum',
        bloomsLevel: 'Applying',
        status: 'unseen',
      },
      {
        id: 'abn_fc_2',
        term: 'Somatic Symptom Disorder vs. Illness Anxiety Disorder',
        definition:
          'Somatic Symptom Disorder: Distressing physical symptoms ARE present (for ≥6 months) accompanied by excessive thoughts, feelings, or behaviors about the symptoms. Illness Anxiety Disorder: Preoccupation with having/acquiring a serious illness where somatic symptoms are NOT present or are only mild.',
        tosCode: 'Section B · 1.4 Somatic Symptom & Related Disorders',
        bloomsLevel: 'Understanding',
        status: 'unseen',
      },
      {
        id: 'abn_fc_3',
        term: 'RA 11036 (Philippine Mental Health Act of 2018) Core Mandates',
        definition:
          'Integrates mental health care into the basic health services from barangay to national levels, protects the rights of service users (informed consent, presumption of legal capacity, least restrictive care), and mandates mental health programs in schools and workplaces.',
        tosCode: 'Section F · 1.1 RA 11036 Mental Health Law',
        bloomsLevel: 'Remembering',
        status: 'unseen',
      },
      {
        id: 'abn_fc_4',
        term: 'Acute Stress Disorder vs. Posttraumatic Stress Disorder (PTSD)',
        definition:
          'Acute Stress Disorder: Symptom duration is 3 days to 1 month following exposure to actual or threatened death, serious injury, or sexual violence. PTSD: Symptoms persist for MORE than 1 month across intrusion, avoidance, negative alterations in cognition/mood, and arousal/reactivity.',
        tosCode: 'Section B · 1.2 Trauma- and Stressor-Related Disorders',
        bloomsLevel: 'Analyzing',
        status: 'unseen',
      },
      {
        id: 'abn_fc_5',
        term: 'Bipolar I vs. Bipolar II vs. Cyclothymic Disorder (DSM-5-TR)',
        definition:
          'Bipolar I requires at least one lifetime Manic Episode (≥1 week or any duration if hospitalized; major depressive episode common but not required). Bipolar II requires at least one Hypomanic Episode (≥4 consecutive days) AND at least one Major Depressive Episode (≥2 weeks), with NO history of mania. Cyclothymic requires ≥2 years (≥1 yr in youth) of numerous hypomanic and depressive symptoms never meeting full episode criteria.',
        tosCode: 'Section B · 1.3 Bipolar & Depressive Disorders',
        bloomsLevel: 'Analyzing',
        status: 'unseen',
      },
    ],
    seedQuestions: [
      {
        id: 'abn_q_1',
        stem: 'Three weeks after surviving a severe typhoon and flash flood in Bicol, 28-year-old Marco experiences recurrent distressing nightmares of rising water, dissociative flashbacks, hypervigilance, and persistent avoidance of news reports about weather disturbances. What is the most accurate DSM-5 diagnosis at this point in time?',
        options: {
          A: 'Posttraumatic Stress Disorder (PTSD)',
          B: 'Acute Stress Disorder',
          C: 'Adjustment Disorder with Mixed Anxiety and Depressed Mood',
          D: 'Brief Psychotic Disorder with Marked Stressor',
        },
        correctChoice: 'B',
        sectionCode: 'B',
        tosCode: 'Section B · 1.2 Trauma- and Stressor-Related Disorders',
        bloomsLevel: 'Analyzing',
        rationale:
          'Because Marco’s trauma-related intrusion, avoidance, dissociation, and arousal symptoms have lasted for three weeks (between 3 days and 1 month post-trauma), the diagnosis is Acute Stress Disorder. PTSD requires symptoms to persist for more than 1 month.',
        optionRationales: {
          A: 'Symptom look-alike trap: Marco’s nightmares, flashbacks, avoidance, and hypervigilance match PTSD’s symptom clusters, but PTSD cannot be diagnosed at "three weeks"—DSM-5 requires duration strictly exceeding 1 month.',
          B: 'Best answer because it accounts for both Marco’s severe trauma symptoms (flashbacks, nightmares, avoidance, hypervigilance) AND the exact "three weeks" post-typhoon duration (within the 3-day to 1-month window).',
          C: 'Not the answer because Adjustment Disorder is reserved for stressor reactions that do not meet criteria for a more specific trauma disorder; Marco’s dissociative flashbacks and re-experiencing meet Acute Stress Disorder.',
          D: 'Shares the under-1-month post-stressor window, but is ruled out because Marco exhibits trauma flashbacks and avoidance rather than frank psychotic delusions, hallucinations, or disorganized speech.',
        },
        adaptiveTips: {
          correctTip:
            'PTSD and Acute Stress Disorder share virtually identical trauma symptom clusters (nightmares, flashbacks, avoidance, hypervigilance), making [A] a classic look-alike. The opening phrase "Three weeks after surviving a severe typhoon" is the decisive context—3 days to 1 month locks in Acute Stress Disorder.',
          misconceptionTips: {
            A: 'Marco’s flashbacks, nightmares, avoidance, and hypervigilance look exactly like PTSD, which is why [A] is the #1 trap here—however, the stem begins with "Three weeks after" the typhoon. Under 1 month (3 days to 1 month), DSM-5 diagnoses Acute Stress Disorder rather than PTSD.',
            C: 'While Marco is reacting to a real stressor within 3 months, Adjustment Disorder is ruled out whenever full criteria for Acute Stress Disorder are met—marked here by dissociative flashbacks and recurrent trauma nightmares.',
            D: 'Brief Psychotic Disorder also lasts under 1 month after a marked stressor, but dissociative trauma flashbacks of a real flood are re-experiencing symptoms of Acute Stress Disorder, not psychotic hallucinations or delusions.',
          },
        },
      },
      {
        id: 'abn_q_2',
        stem: 'Carlo, a 32-year-old accountant, has virtually no severe physical pain or symptoms, yet he spends hours every evening reading medical journals and remains terrified that he has undiagnosed pancreatic cancer despite three normal CT scans and reassurance from two gastroenterologists. Which DSM-5 diagnosis best fits Carlo’s presentation?',
        options: {
          A: 'Somatic Symptom Disorder',
          B: 'Illness Anxiety Disorder, Care-Seeking Type',
          C: 'Conversion Disorder (Functional Neurological Symptom Disorder)',
          D: 'Factitious Disorder Imposed on Self',
        },
        correctChoice: 'B',
        sectionCode: 'B',
        tosCode: 'Section B · 1.4 Somatic Symptom & Related Disorders',
        bloomsLevel: 'Understanding',
        rationale:
          'Illness Anxiety Disorder involves a high preoccupation with having or acquiring a serious medical illness with minimal or absent somatic symptoms, persisting despite medical reassurance—and Carlo’s repeated CT scans and specialist visits specify the Care-Seeking Type.',
        optionRationales: {
          A: 'Closest look-alike trap: shares intense health anxiety, but Somatic Symptom Disorder requires prominent, distressing physical symptoms, which is directly ruled out by Carlo having "virtually no severe physical pain or symptoms."',
          B: 'Best answer because it captures both Carlo’s intense fear of undiagnosed cancer in the absence of physical symptoms AND his repeated CT scans and gastroenterologist visits (Care-Seeking Type).',
          C: 'Not the answer in Carlo’s case because Conversion Disorder requires altered voluntary motor or sensory function (e.g., unexplained paralysis or blindness), which is absent here.',
          D: 'Not the answer because Factitious Disorder involves intentionally feigning or inducing symptoms for the sick role, whereas Carlo genuinely fears having cancer without fabricating symptoms.',
        },
        adaptiveTips: {
          correctTip:
            'Somatic Symptom Disorder and Illness Anxiety Disorder both center on persistent medical worry, but two stem details make [B] the exact fit: Carlo has "virtually no severe physical pain or symptoms" (ruling out Somatic Symptom Disorder) and has undergone three CT scans plus two specialist consults (confirming Care-Seeking Type).',
          misconceptionTips: {
            A: 'Somatic Symptom Disorder is tempting because Carlo spends hours worrying about pancreatic cancer—but look at the opening clause: he "has virtually no severe physical pain or symptoms." High health anxiety WITHOUT prominent physical symptoms defines Illness Anxiety Disorder.',
            C: 'Conversion Disorder involves neurological-like motor or sensory deficits (such as sudden psychogenic blindness or limb weakness), whereas Carlo has no physical deficits—only persistent fear of having cancer.',
            D: 'In Factitious Disorder, the person consciously fabricates or induces illness signs; Carlo is not faking anything—he has no physical symptoms and is genuinely terrified despite normal CT scans (Illness Anxiety Disorder).',
          },
        },
      },
      {
        id: 'abn_q_3',
        stem: 'Under Republic Act No. 11036 (Philippine Mental Health Act), which principle governs the legal capacity of a service user diagnosed with a mental health condition?',
        options: {
          A: 'A psychiatric diagnosis automatically suspends legal capacity until cleared by a court.',
          B: 'Service users are presumed to possess legal capacity to exercise their rights and make treatment decisions unless proven otherwise in accordance with law.',
          C: 'Family members automatically assume irrevocable decision-making power upon hospital admission.',
          D: 'Only a barangay captain can authorize voluntary admission to a mental health facility.',
        },
        correctChoice: 'B',
        sectionCode: 'F',
        tosCode: 'Section F · 1.2 RA 11036 Mental Health Law',
        bloomsLevel: 'Evaluating',
        rationale:
          'RA 11036 upholds the presumption of legal capacity: all persons with mental health conditions are presumed capable of making decisions regarding their treatment and exercising their rights unless legally determined otherwise.',
        optionRationales: {
          A: 'Directly contradicts RA 11036: the law was enacted specifically to end the assumption that a mental health diagnosis automatically removes a person’s legal decision-making capacity.',
          B: 'Best answer because RA 11036 explicitly establishes the statutory presumption of legal capacity for service users, subject only to due-process exceptions defined by law.',
          C: 'Partial distortion of family involvement: while RA 11036 recognizes legal representatives during temporary incapacity, family authority is neither automatic upon admission nor irrevocable.',
          D: 'Incorrect statutory context: voluntary admission under RA 11036 rests on the service user’s own free and informed consent, not authorization from a barangay captain.',
        },
        adaptiveTips: {
          correctTip:
            'Notice how Options A, C, and D all treat a diagnosis or hospital admission as automatically transferring decision-making power to courts, relatives, or barangay officials. [B] is the best answer because RA 11036’s foundational rights paradigm presumes every service user retains legal capacity unless proven otherwise under law.',
          misconceptionTips: {
            A: 'Under RA 11036, a psychiatric diagnosis never automatically suspends legal capacity—the statute flips that outdated assumption by presuming legal capacity unless proven otherwise in accordance with law.',
            C: 'Although family members often participate in Philippine care settings, RA 11036 does not grant them automatic or irrevocable decision-making power upon admission; the service user’s own legal capacity is presumed first.',
            D: 'Barangay officials may assist in community emergencies, but voluntary admission under RA 11036 is authorized by the service user’s own informed consent because they are presumed to possess legal capacity.',
          },
        },
      },
      {
        id: 'abn_q_4',
        stem: 'Which personality disorder in Cluster A is characterized by a pervasive pattern of detachment from social relationships and a restricted range of emotional expression in interpersonal settings, WITHOUT cognitive/perceptual distortions or magical thinking?',
        options: {
          A: 'Schizotypal Personality Disorder',
          B: 'Schizoid Personality Disorder',
          C: 'Avoidant Personality Disorder',
          D: 'Paranoid Personality Disorder',
        },
        correctChoice: 'B',
        sectionCode: 'B',
        tosCode: 'Section B · 1.11 Personality Disorders',
        bloomsLevel: 'Applying',
        rationale:
          'Schizoid Personality Disorder is marked by social detachment, preference for solitary activities, and emotional coldness/flatness without the odd beliefs, magical thinking, or perceptual distortions of Schizotypal PD, and without the fear of rejection seen in Avoidant PD.',
        optionRationales: {
          A: 'Cluster A look-alike trap: shares social detachment and constricted affect, but is directly ruled out by the stem’s explicit exclusion ("WITHOUT cognitive/perceptual distortions or magical thinking").',
          B: 'Best answer because it belongs to Cluster A and matches both pervasive social detachment/restricted affect AND the absence of magical thinking or perceptual distortions.',
          C: 'Behavioral look-alike trap: also appears socially withdrawn, but belongs to Cluster C (not Cluster A as specified in the stem) and is driven by hypersensitivity to rejection rather than emotional indifference.',
          D: 'Belongs to Cluster A, but centers on pervasive suspicion and reading malevolent intent into others rather than passive social detachment and flattened emotional expression.',
        },
        adaptiveTips: {
          correctTip:
            'Two qualifiers in the stem eliminate every close look-alike: "in Cluster A" rules out Avoidant PD (Cluster C), and "WITHOUT cognitive/perceptual distortions or magical thinking" rules out Schizotypal PD—leaving Schizoid Personality Disorder as the exact match.',
          misconceptionTips: {
            A: 'Schizotypal PD is also in Cluster A and involves social deficits, making it the closest look-alike—but the stem explicitly specifies "WITHOUT cognitive/perceptual distortions or magical thinking," which are hallmark features of Schizotypal PD and rule it out in favor of Schizoid PD.',
            C: 'Avoidant PD looks outwardly similar because both involve social isolation, but Avoidant PD belongs to Cluster C (anxious/fearful of rejection) rather than Cluster A ("odd/eccentric" emotional indifference in Schizoid PD).',
            D: 'While Paranoid PD is in Cluster A, its core feature is pervasive distrust and suspicion of hostility rather than the passive social indifference and restricted emotional range of Schizoid PD.',
          },
        },
      },
    ],
  },

  io_psych: {
    id: 'io_psych',
    shortTitle: 'I/O Psych',
    fullTitle: 'Industrial-Organizational Psychology',
    officialTosSubjectHeader: 'Annex "B" · Board for Psychometricians (As of February 2023 · PQF Level 6)',
    officialPdfPageRange: 'Pages 20–22',
    officialPdfStartPage: 20,
    weightPercent: 20,
    totalBoardItems: 100,
    examDurationMinutes: 180,
    bloomsDistributionSummary:
      'Easy 30% (9 Rem · 21 Und) · Moderate 40% (40 App) · Difficult 30% (22 Ana · 8 Eva)',
    referenceTextbooks: 'Aamodt (Industrial/Organizational Psychology: An Applied Approach), Spector, Levy',
    sections: [
      {
        id: 'io_A',
        sectionLetter: 'A',
        title: 'Organization Theory',
        weightPercent: 20,
        itemCount: 20,
        competencies: [
          {
            id: 'io_A_1_1',
            code: '1.1',
            description: 'Describe the different organizational theories, models and concepts',
            itemCount: 5,
            bloomsBreakdown: '5 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'io_A_1_2a',
            code: '1.2',
            description: 'Apply the different theories of organizations to the overall understanding of human behavior in an organizational setting',
            itemCount: 5,
            bloomsBreakdown: '5 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'io_A_1_2b',
            code: '1.2',
            description: 'Determine the focus and analyze the differences between these Organization Theories: Classical Organization Theory, Neo-Classical Organizational Theory, Modern Organizational Theory, Contingency Theory, Motivation Theory and Open Systems Theory',
            itemCount: 6,
            bloomsBreakdown: '3 Analyzing · 3 Evaluating',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'io_A_1_3',
            code: '1.3',
            description: 'Examine the importance of organization theory, particularly on how organizations use that knowledge to help them improve organizational structure and design, leadership, managerial styles, group behavior, motivation, communication, operational efficiency and organizational culture',
            itemCount: 4,
            bloomsBreakdown: '4 Analyzing',
            primaryBlooms: 'Analyzing',
          },
        ],
      },
      {
        id: 'io_B',
        sectionLetter: 'B',
        title: 'Organizational Structures & Systems',
        weightPercent: 20,
        itemCount: 20,
        competencies: [
          {
            id: 'io_B_2_1',
            code: '2.1',
            description: 'Evaluate the value and importance of knowing & understanding the various organizational models and systems',
            itemCount: 2,
            bloomsBreakdown: '2 Evaluating',
            primaryBlooms: 'Evaluating',
          },
          {
            id: 'io_B_2_2',
            code: '2.2',
            description: 'Recognize the pros and cons of the different types of organizational structures: functional, multi-divisional, flat, matrix, team, network, and hierarchical structures',
            itemCount: 6,
            bloomsBreakdown: '6 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'io_B_2_3',
            code: '2.3',
            description: 'Define the elements that create an organizational structure and their distinct relationships: job design, departmentation, delegation, span of control and chain of command',
            itemCount: 2,
            bloomsBreakdown: '2 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'io_B_2_4',
            code: '2.4',
            description: 'Apply your understanding of organizational design to appreciate organizational roles and performance accountability',
            itemCount: 4,
            bloomsBreakdown: '4 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'io_B_2_5',
            code: '2.5',
            description: 'Explain the importance of aligning the organizational structure with the business Strategy',
            itemCount: 2,
            bloomsBreakdown: '2 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'io_B_2_6',
            code: '2.6',
            description: 'Apply your understanding of the 4 business elements that must be aligned to ensure profitable performance and business success',
            itemCount: 4,
            bloomsBreakdown: '4 Applying',
            primaryBlooms: 'Applying',
          },
        ],
      },
      {
        id: 'io_C',
        sectionLetter: 'C',
        title: "Human Resource Dev't & Human Resource Mgmt.",
        weightPercent: 25,
        itemCount: 25,
        competencies: [
          {
            id: 'io_C_3_1',
            code: '3.1',
            description: "Differentiate: (a) Human Resource Development (HRD) and Human Resource Mgmt. (HRM), (b) Human Resource Dev't (HRD) & Organizational Development (OD), (c) HRD & Employee Training",
            itemCount: 5,
            bloomsBreakdown: '5 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'io_C_3_2',
            code: '3.2',
            description: 'Identify the activities involved in Human Resource Development',
            itemCount: 3,
            bloomsBreakdown: '3 Remembering',
            primaryBlooms: 'Remembering',
          },
          {
            id: 'io_C_3_3',
            code: '3.3',
            description: 'Examine the scope, coverage, and processes across the different areas of Human Resource Development (training, learning, career development, talent management, performance appraisal, employee engagement and empowerment)',
            itemCount: 5,
            bloomsBreakdown: '2 Applying · 3 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'io_C_3_4',
            code: '3.4',
            description: 'Analyze the organizational activities involved in Human Resources Management (manpower planning, staffing, developing, monitoring, maintaining, managing relationship and evaluating)',
            itemCount: 8,
            bloomsBreakdown: '8 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'io_C_3_5',
            code: '3.5',
            description: 'Compare the role of the Human Resource Manager and the Human Resource Development Manager in an Organization',
            itemCount: 4,
            bloomsBreakdown: '4 Applying',
            primaryBlooms: 'Applying',
          },
        ],
      },
      {
        id: 'io_D',
        sectionLetter: 'D',
        title: 'Team Dynamics',
        weightPercent: 15,
        itemCount: 15,
        competencies: [
          {
            id: 'io_D_4_1',
            code: '4.1',
            description: 'Explain the importance and impact of team dynamics in an organization',
            itemCount: 3,
            bloomsBreakdown: '3 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'io_D_4_2a',
            code: '4.2',
            description: 'Identify the stages of team development',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'io_D_4_2b',
            code: '4.2',
            description: 'Examine group processes that affect team effectiveness',
            itemCount: 2,
            bloomsBreakdown: '2 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'io_D_4_4',
            code: '4.4',
            description: 'Identify the common problems that occur in teams',
            itemCount: 3,
            bloomsBreakdown: '3 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'io_D_4_5',
            code: '4.5',
            description: 'Apply your knowledge of team dynamics to address team problems and improve team performance',
            itemCount: 4,
            bloomsBreakdown: '4 Applying',
            primaryBlooms: 'Applying',
          },
        ],
      },
      {
        id: 'io_E',
        sectionLetter: 'E',
        title: 'Organizational Change & Development',
        weightPercent: 20,
        itemCount: 20,
        competencies: [
          {
            id: 'io_E_5_1',
            code: '5.1',
            description: 'Distinguish the difference between: (a) Organizational Change & OD, and (b) OD & Organizational Transformation',
            itemCount: 3,
            bloomsBreakdown: '3 Applying',
            primaryBlooms: 'Applying',
          },
          {
            id: 'io_E_5_2',
            code: '5.2',
            description: 'Analyze the different factors driving organizational change',
            itemCount: 4,
            bloomsBreakdown: '4 Analyzing',
            primaryBlooms: 'Analyzing',
          },
          {
            id: 'io_E_5_3',
            code: '5.3',
            description: 'Identify the different types of large scale organizational changes',
            itemCount: 6,
            bloomsBreakdown: '6 Understanding',
            primaryBlooms: 'Understanding',
          },
          {
            id: 'io_E_5_4',
            code: '5.4',
            description: 'Evaluate the different types of Organizational Interventions used to enhance organizational effectiveness, employee well-being and productivity',
            itemCount: 3,
            bloomsBreakdown: '3 Evaluating',
            primaryBlooms: 'Evaluating',
          },
          {
            id: 'io_E_5_5',
            code: '5.5',
            description: 'Examine the different strategies and techniques organizations use to manage change and/or cope with change to achieve organizational efficiency',
            itemCount: 4,
            bloomsBreakdown: '4 Applying',
            primaryBlooms: 'Applying',
          },
        ],
      },
    ],
    seedFlashcards: [
      {
        id: 'io_fc_1',
        term: 'Matrix Organizational Structure: Dual Chain of Command',
        definition:
          'Combines functional departmentation with product/project departmentation. Employees report to two bosses simultaneously (a Functional Manager and a Project/Product Manager). Advantage: cross-functional resource sharing. Disadvantage: role ambiguity and violation of classical unity of command.',
        tosCode: 'Section B · 2.2 Organizational Structures',
        bloomsLevel: 'Remembering',
        status: 'unseen',
      },
      {
        id: 'io_fc_2',
        term: 'Hackman & Oldham’s Job Characteristics Model (JCM)',
        definition:
          'Five Core Job Dimensions: 1. Skill Variety, 2. Task Identity, 3. Task Significance (these 3 create Experienced Meaningfulness), 4. Autonomy (creates Experienced Responsibility), and 5. Feedback (creates Knowledge of Results). MPS = [(SV + TI + TS)/3] × Autonomy × Feedback.',
        tosCode: 'Section B · 2.3 Job Design & Structure',
        bloomsLevel: 'Understanding',
        status: 'unseen',
      },
      {
        id: 'io_fc_3',
        term: 'HRM vs. HRD vs. Organizational Development (OD)',
        definition:
          'HRM encompasses the full spectrum of personnel functions (manpower planning, recruitment, selection, compensation, labor relations). HRD focuses specifically on learning, training, and career development to build competencies. OD is a system-wide, planned behavioral science effort to improve overall organizational renewal and culture.',
        tosCode: 'Section C · 3.1 Differentiate HRD, HRM, and OD',
        bloomsLevel: 'Applying',
        status: 'unseen',
      },
      {
        id: 'io_fc_4',
        term: 'Kurt Lewin’s Force-Field Analysis & 3-Step Change Model',
        definition:
          '1. Unfreezing: Reducing restraining forces or increasing driving forces to overcome inertia.\n2. Moving (Changing): Implementing the new behavior, process, or structure.\n3. Refreezing: Stabilizing and institutionalizing the change into organizational norms and reward systems.',
        tosCode: 'Section E · 5.5 Managing Organizational Change',
        bloomsLevel: 'Applying',
        status: 'unseen',
      },
      {
        id: 'io_fc_5',
        term: 'Job Analysis: Job Description vs. Job Specification (KSAOs)',
        definition:
          'Job Description documents the tasks, duties, responsibilities, reporting relationships, and working conditions of the role itself. Job Specification documents the human qualifications required to perform the job—specifically Knowledge, Skills, Abilities, and Other characteristics (KSAOs).',
        tosCode: 'Section C · 3.2 Job Analysis & Selection',
        bloomsLevel: 'Understanding',
        status: 'unseen',
      },
    ],
    seedQuestions: [
      {
        id: 'io_q_1',
        stem: 'A software engineering firm in Taguig assigns its UI designers and backend developers to both a permanent Functional Engineering Department Manager and a temporary FinTech Client Squad Lead. While resource flexibility improved, several developers report conflicting priorities between their two supervisors. This company is operating under which organizational structure?',
        options: {
          A: 'Multi-divisional (M-form) structure',
          B: 'Matrix structure',
          C: 'Simple flat structure',
          D: 'Mechanistic bureaucracy',
        },
        correctChoice: 'B',
        sectionCode: 'B',
        tosCode: 'Section B · 2.2 Matrix & Functional Structures',
        bloomsLevel: 'Applying',
        rationale:
          'A Matrix structure overlays project/product teams across functional departments, creating a dual chain of command. While it maximizes specialist sharing, it frequently introduces role conflict and ambiguity when functional and project bosses disagree.',
        optionRationales: {
          A: 'Partial look-alike: M-form organizations do organize around client or product lines, but employees report within self-contained divisions rather than simultaneously answering to both a Functional Engineering Manager and a Client Squad Lead.',
          B: 'Best answer because the Taguig firm explicitly pairs dual reporting lines (permanent functional manager + temporary client squad lead) with the classic trade-off of improved specialist flexibility vs. two-boss priority conflict.',
          C: 'Not the answer in this context because a simple flat structure minimizes management layers under single direct leadership rather than creating two simultaneous supervisors with competing priorities.',
          D: 'Directly contradicted by the vignette: mechanistic bureaucracy enforces strict unity of command (one boss per employee) and rigid hierarchy, the opposite of cross-functional squad overlays.',
        },
        adaptiveTips: {
          correctTip:
            'Both M-form and Matrix structures address product/client focus, which can make [A] look partially right—but the stem’s dual chain of command (reporting simultaneously to a permanent Functional Manager and a temporary FinTech Squad Lead, causing two-boss conflict) uniquely defines a Matrix structure.',
          misconceptionTips: {
            A: 'Multi-divisional (M-form) structures group employees into separate, autonomous product or client divisions, whereas the Taguig developers remain under their Functional Engineering Manager while ALSO reporting to a FinTech Squad Lead—the hallmark dual authority of a Matrix structure.',
            C: 'A simple flat structure reduces hierarchy and widens span of control, which might sound flexible like a tech firm, but it does not assign employees to two simultaneous supervisors with conflicting priorities (Matrix structure).',
            D: 'Mechanistic bureaucracy relies on strict classical unity of command (one supervisor per subordinate), which is the exact opposite of the two-supervisor setup described in the vignette.',
          },
        },
      },
      {
        id: 'io_q_2',
        stem: 'During a cross-departmental product launch team’s third week, members begin openly disagreeing over who should control the marketing budget and challenging the team leader’s timeline. According to Bruce Tuckman’s model, which stage of team development is the group experiencing?',
        options: {
          A: 'Forming',
          B: 'Storming',
          C: 'Norming',
          D: 'Performing',
        },
        correctChoice: 'B',
        sectionCode: 'D',
        tosCode: 'Section D · 4.2a Stages of Team Development',
        bloomsLevel: 'Understanding',
        rationale:
          'The Storming stage is characterized by intragroup conflict, resistance to group constraints, and disagreements over leadership and task roles before cohesive norms are established in the Norming stage.',
        optionRationales: {
          A: 'Not the answer because Forming is marked by polite, cautious orientation and reliance on the leader, whereas this team has moved into open conflict over budget control and leadership timelines.',
          B: 'Best fits the vignette because open turf disputes over who controls the budget and direct challenges to the leader’s timeline are the defining behaviors of Tuckman’s Storming stage.',
          C: 'Not the answer yet: Norming occurs only after power and role conflicts begin resolving into shared ground rules and cohesion, whereas members here are just beginning to clash.',
          D: 'Not the answer because Performing teams have already settled role and authority disputes so energy flows smoothly into goal execution rather than fighting over budget control.',
        },
        adaptiveTips: {
          correctTip:
            'The time cue ("third week") might seem early enough to tempt Forming or late enough to tempt Norming, so judge Tuckman’s stage by group behavior rather than week count: active turf conflict over budget control and challenging the leader’s authority squarely pinpoint Storming.',
          misconceptionTips: {
            A: 'Although "third week" sounds early in a project, Forming involves polite, tentative orientation where members avoid controversy. Once members openly clash over budget control and challenge the leader’s timeline, the team has entered Storming.',
            C: 'Norming is when a team resolves disputes and agrees on shared roles and workflows; here, disagreements over budget ownership and the leader’s timeline are actively erupting, which defines Storming.',
            D: 'In Performing, role authority is already consensual and conflict is channeled constructively into task delivery, unlike the unresolved turf battle over budget and leadership described here (Storming).',
          },
        },
      },
      {
        id: 'io_q_3',
        stem: 'Before designing a company-wide training curriculum on cloud migration, the HRD Manager conducts an analysis to determine whether current employees lack knowledge/skills or whether poor performance is actually caused by outdated hardware and unclear incentives. In Training Needs Analysis (TNA), examining individual employee performance gaps is called:',
        options: {
          A: 'Organizational analysis',
          B: 'Task (Operations) analysis',
          C: 'Person analysis',
          D: 'Demographic workforce audit',
        },
        correctChoice: 'C',
        sectionCode: 'C',
        tosCode: 'Section C · 3.3 HRD Training & Needs Analysis',
        bloomsLevel: 'Analyzing',
        rationale:
          'In Goldstein’s three-level Training Needs Analysis (Organizational, Task, and Person analysis), Person analysis determines which specific employees need training and whether deficient performance stems from a KSAO gap (trainable) or a motivational/equipment issue (non-training intervention).',
        optionRationales: {
          A: 'Partial vignette trap: although the stem mentions "company-wide" cloud migration, hardware resources, and incentives, the final question specifically asks what examining INDIVIDUAL employee performance gaps is called—which is Person analysis, not Organizational analysis.',
          B: 'Not the answer here because Task analysis defines what duties and KSAOs the cloud migration job itself requires, rather than evaluating why current employees are underperforming.',
          C: 'Best answer because diagnosing whether individual employees’ performance gaps come from a trainable skill deficit versus non-training barriers (outdated hardware or unclear incentives) is the exact function of Person analysis.',
          D: 'Not a TNA level: a demographic audit tracks workforce age, tenure, or diversity composition rather than diagnosing individual skill vs. environmental performance causes.',
        },
        adaptiveTips: {
          correctTip:
            'This stem intentionally blends company-level words ("company-wide," "outdated hardware," "unclear incentives") that make Organizational analysis look tempting—but read the exact target at the end: diagnosing whether INDIVIDUAL employee performance gaps stem from missing KSAOs vs. equipment/incentive barriers is the textbook definition of Person analysis.',
          misconceptionTips: {
            A: 'Organizational analysis is a strong partial trap here because the vignette mentions "company-wide" migration and organizational factors like hardware and incentives. However, checking those factors to explain individual employees’ performance gaps (trainable KSAO deficit vs. non-training issue) is specifically Person analysis.',
            B: 'Task (Operations) analysis inventories the steps and KSAOs needed to perform the job itself regardless of who holds it, whereas evaluating current employees’ actual performance gaps is Person analysis.',
            D: 'A demographic workforce audit summarizes employee population traits (like age or tenure) for HR planning, not whether underperformance is caused by skill gaps versus hardware/incentives (Person analysis).',
          },
        },
      },
      {
        id: 'io_q_4',
        stem: 'Which classical organization theorist formulated the 14 Principles of Management—including Unity of Command, Scalar Chain, Esprit de Corps, and Division of Work—focusing on administrative management from the top down?',
        options: {
          A: 'Frederick Winslow Taylor',
          B: 'Henri Fayol',
          C: 'Elton Mayo',
          D: 'Douglas McGregor',
        },
        correctChoice: 'B',
        sectionCode: 'A',
        tosCode: 'Section A · 1.2b Classical vs. Neo-Classical Theory',
        bloomsLevel: 'Analyzing',
        rationale:
          'Henri Fayol developed Administrative Theory and the 14 Principles of Management (including Unity of Command and Scalar Chain). Frederick Taylor pioneered Scientific Management (time-and-motion studies at the shop-floor level), while Elton Mayo led the Hawthorne Studies (Neo-Classical/Human Relations).',
        optionRationales: {
          A: 'Classical-era look-alike trap: Taylor is also a Classical theorist and studied division of labor, but his Scientific Management worked bottom-up on shop-floor tasks and time-and-motion efficiency rather than top-down 14 administrative principles.',
          B: 'Best answer because Henri Fayol specifically authored the 14 Principles of Management (Unity of Command, Scalar Chain, Esprit de Corps, Division of Work) from an executive, top-down administrative perspective.',
          C: 'Not the answer because Elton Mayo spearheaded the Neo-Classical Human Relations movement (Hawthorne Studies) emphasizing informal social groups and morale rather than Classical administrative structure.',
          D: 'Not the answer because Douglas McGregor formulated Theory X and Theory Y assumptions about worker motivation rather than the Classical 14 Principles of Management.',
        },
        adaptiveTips: {
          correctTip:
            'Both Taylor and Fayol belong to Classical Organization Theory, making [A] the main look-alike—but the stem’s two cues ("14 Principles of Management" including Unity of Command/Scalar Chain, and "from the top down" executive administration vs. Taylor’s bottom-up shop-floor motion studies) uniquely identify Henri Fayol.',
          misconceptionTips: {
            A: 'Taylor and Fayol are both Classical theorists, so [A] is a classic partial match—however, Taylor focused bottom-up on individual shop-floor task efficiency (Scientific Management), whereas top-down Administrative Theory and the 14 Principles of Management belong to Henri Fayol.',
            C: 'While Esprit de Corps mentions team spirit, it is one of Henri Fayol’s 14 Classical Administrative Principles; Elton Mayo belongs to the later Neo-Classical/Human Relations school (Hawthorne Studies).',
            D: 'Douglas McGregor is known for Theory X and Theory Y managerial assumptions in behavioral management, whereas the 14 Principles of Management (Unity of Command, Scalar Chain) were formulated by Henri Fayol.',
          },
        },
      },
    ],
  },
};

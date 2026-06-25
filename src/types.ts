export type BloomLevel =
  | "Remember"
  | "Understand"
  | "Apply"
  | "Analyze"
  | "Evaluate"
  | "Create";

export type TopicExposureStatus =
  | "first_introduction"
  | "review_reinforcement"
  | "builds_on_prior_sim"
  | "remediation"
  | "integration_assessment"
  | "end_of_program_mastery";

export type ParsedSyllabusModule = {
  courseCode?: string;
  courseTitle?: string;
  weekOrModule: string;
  topic: string;
  learningObjectives: string[];
  detectedBloomLevel: BloomLevel;
  clinicalFocus: {
    patientPopulation: string[];
    pathologies: string[];
    therapies: string[];
    equipment: string[];
    assessmentData: string[];
    skills: string[];
    decisionTypes: string[];
  };
  topicExposureStatus: TopicExposureStatus;
};

export type ParsedSyllabusResponse = {
  courseCode?: string;
  courseTitle?: string;
  courseDescription?: string;
  learningObjectives?: string[];
  modules: ParsedSyllabusModule[];
};

export type SimulationDifficulty =
  | "Basic"
  | "Intermediate"
  | "Advanced"
  | "NBRC"
  | "Variable";

export type SimulationCatalogItem = {
  id: string;
  name: string;
  difficulty: SimulationDifficulty;
  clinicalFocus: string[];
  pathologies: string[];
  content: string[];
  skills: string[];
  bloomTargets: BloomLevel[];
  endOfProgramOnly?: boolean;
  debriefFocus: string[];
  readinessWarning?: string;
};

export type ProgramTerm =
  | "Term 1"
  | "Term 2"
  | "Term 3"
  | "Term 4"
  | "Term 5";

export type TermAssignmentSource =
  | "course_code"
  | "filename"
  | "content_inference"
  | "manual_override";

export type TermAssignmentConfidence = "high" | "medium" | "low";

export type TermRule = {
  term: ProgramTerm;
  label: string;
  assignedTier: string;
  allowedPrimaryDifficulties: SimulationDifficulty[];
  allowedReviewDifficulties: SimulationDifficulty[];
  blockedDifficulties: SimulationDifficulty[];
};

export type AlignmentStatus =
  | "Full"
  | "Partial"
  | "Weak"
  | "No clean match"
  | "Needs human review";

export type DebriefQuestions = {
  allans3w: string[];
  therapyIndication: string;
  therapyEffectiveness: string;
  setupAccuracy: string;
  evidenceRequired: string;
  stopChangeEscalate: string;
};

export type SimRecommendationResult = {
  term: ProgramTerm;
  termLabel: string;
  courseCode?: string;
  weekOrModule: string;
  topic: string;
  learningObjectives: string[];
  detectedBloomLevel: BloomLevel;
  clinicalFocusSummary: string[];
  topicExposureStatus: TopicExposureStatus;
  assignedDifficultyTier: string;
  allowedDifficulties: SimulationDifficulty[];
  alignmentStatus: AlignmentStatus;
  alignmentNote: string;
  appropriateSimPool: Array<{
    id: string;
    name: string;
    difficulty: SimulationDifficulty;
    score: number;
    whyAppropriate: string;
  }>;
  recommendedSims: Array<{
    id: string;
    name: string;
    difficulty: SimulationDifficulty;
    score: number;
    rationale: string;
    bloomAlignment: string;
    readinessAlignment: string;
    instructorUseNote: string;
    not100PercentAlignmentNote?: string;
    debriefQuestions: DebriefQuestions;
  }>;
  rejectedNearMatches: Array<{
    id: string;
    name: string;
    difficulty: SimulationDifficulty;
    reasonRejected: string;
  }>;
};

export type UploadedSyllabus = {
  id: string;
  fileName: string;
  rawText?: string;
  detectedCourseCode?: string;
  detectedCourseTitle?: string;
  assignedProgramTerm: ProgramTerm;
  termAssignmentSource?: TermAssignmentSource;
  termAssignmentConfidence?: TermAssignmentConfidence;
  termAssignmentReason?: string;
  parsedModules: ParsedSyllabusModule[];
  parsingStatus: "pending" | "parsing" | "parsed" | "fallback" | "error";
  rawParsedJson?: unknown;
  parseMessage?: string;
};

export type ProgramTermAlignment = {
  term: ProgramTerm;
  termLabel: string;
  uploadedSyllabi: Array<{
    syllabusId: string;
    fileName: string;
    detectedCourseTitle?: string;
    detectedCourseCode?: string;
    clinicalFocusSummary: string[];
    recommendations: SimRecommendationResult[];
  }>;
};

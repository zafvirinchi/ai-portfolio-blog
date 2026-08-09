import { z } from "zod";

// Phase 13 Milestone 3. Same "LLM-output schema + deterministic-section
// schema, assembled into one final report" split every other milestone
// in this arc uses (jd-schema.ts's OptimizerOutput vs JdMatchResult,
// resume-optimizer-schema.ts's LlmOutput vs Result). Only the question/
// answer generation goes through response_format — every other section
// here is computed in code from data already produced upstream.

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const QUESTION_SOURCES = ["knowledge-base", "ai-generated"] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

export const technicalAnswerSchema = z.object({
  architecture: z.string(),
  tradeoffs: z.string(),
  bestPractices: z.string(),
  performance: z.string(),
  security: z.string(),
});

export const starAnswerSchema = z.object({
  situation: z.string(),
  task: z.string(),
  action: z.string(),
  result: z.string(),
});

export type TechnicalAnswer = z.infer<typeof technicalAnswerSchema>;
export type StarAnswer = z.infer<typeof starAnswerSchema>;

// ---------------------------------------------------------------------------
// Knowledge-base-sourced questions — reuse the KB's own question/answer
// verbatim (question-generator.ts), never re-run through the LLM. Answer
// stored as plain text here since the interview_questions table's answer
// is already prose, not STAR/technical-structured.
// ---------------------------------------------------------------------------

export const knowledgeBaseQuestionSchema = z.object({
  question: z.string(),
  answer: z.string(),
  difficulty: z.string(),
  topic: z.string(),
  category: z.string(),
  source: z.literal("knowledge-base"),
});

export type KnowledgeBaseQuestion = z.infer<typeof knowledgeBaseQuestionSchema>;

// ---------------------------------------------------------------------------
// AI-generated questions — the one structured-output call
// (question-generator.ts's generateQuestionsAndAnswers).
// ---------------------------------------------------------------------------

export const technicalQuestionItemSchema = z.object({
  question: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  topic: z.string(),
  idealAnswer: technicalAnswerSchema,
});

export const hrQuestionItemSchema = z.object({
  question: z.string(),
  category: z.enum(["Leadership", "Conflict Resolution", "Ownership", "Teamwork", "Communication", "Career Goals"]),
  idealAnswer: starAnswerSchema,
});

export const projectQuestionItemSchema = z.object({
  question: z.string(),
  projectName: z.string(),
  focus: z.enum(["Architecture", "Challenges", "Design Decisions", "Scaling", "Security", "Deployment", "Trade-offs"]),
  idealAnswer: starAnswerSchema,
});

export const systemDesignQuestionItemSchema = z.object({
  question: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  idealAnswer: technicalAnswerSchema,
});

export type TechnicalQuestionItem = z.infer<typeof technicalQuestionItemSchema>;
export type HrQuestionItem = z.infer<typeof hrQuestionItemSchema>;
export type ProjectQuestionItem = z.infer<typeof projectQuestionItemSchema>;
export type SystemDesignQuestionItem = z.infer<typeof systemDesignQuestionItemSchema>;

export const generatedQuestionsSchema = z.object({
  technicalQuestions: z.array(technicalQuestionItemSchema).default([]),
  hrQuestions: z.array(hrQuestionItemSchema).default([]),
  projectQuestions: z.array(projectQuestionItemSchema).default([]),
  systemDesignQuestions: z.array(systemDesignQuestionItemSchema).default([]),
});

export type GeneratedQuestions = z.infer<typeof generatedQuestionsSchema>;

const technicalAnswerJsonSchema = {
  type: "object",
  properties: {
    architecture: { type: "string" },
    tradeoffs: { type: "string" },
    bestPractices: { type: "string" },
    performance: { type: "string" },
    security: { type: "string" },
  },
  required: ["architecture", "tradeoffs", "bestPractices", "performance", "security"],
  additionalProperties: false,
};

const starAnswerJsonSchema = {
  type: "object",
  properties: {
    situation: { type: "string" },
    task: { type: "string" },
    action: { type: "string" },
    result: { type: "string" },
  },
  required: ["situation", "task", "action", "result"],
  additionalProperties: false,
};

export const GENERATED_QUESTIONS_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "interview_prep_questions",
  strict: true,
  schema: {
    type: "object",
    properties: {
      technicalQuestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            difficulty: { type: "string", enum: [...DIFFICULTIES] },
            topic: { type: "string" },
            idealAnswer: technicalAnswerJsonSchema,
          },
          required: ["question", "difficulty", "topic", "idealAnswer"],
          additionalProperties: false,
        },
      },
      hrQuestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            category: {
              type: "string",
              enum: ["Leadership", "Conflict Resolution", "Ownership", "Teamwork", "Communication", "Career Goals"],
            },
            idealAnswer: starAnswerJsonSchema,
          },
          required: ["question", "category", "idealAnswer"],
          additionalProperties: false,
        },
      },
      projectQuestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            projectName: { type: "string" },
            focus: {
              type: "string",
              enum: ["Architecture", "Challenges", "Design Decisions", "Scaling", "Security", "Deployment", "Trade-offs"],
            },
            idealAnswer: starAnswerJsonSchema,
          },
          required: ["question", "projectName", "focus", "idealAnswer"],
          additionalProperties: false,
        },
      },
      systemDesignQuestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            difficulty: { type: "string", enum: [...DIFFICULTIES] },
            idealAnswer: technicalAnswerJsonSchema,
          },
          required: ["question", "difficulty", "idealAnswer"],
          additionalProperties: false,
        },
      },
    },
    required: ["technicalQuestions", "hrQuestions", "projectQuestions", "systemDesignQuestions"],
    additionalProperties: false,
  },
};

// Single-question on-demand generation (answer-generator.ts).
export const idealAnswerResultSchema = z.union([
  z.object({ format: z.literal("technical"), answer: technicalAnswerSchema }),
  z.object({ format: z.literal("star"), answer: starAnswerSchema }),
]);

export type IdealAnswerResult = z.infer<typeof idealAnswerResultSchema>;

const idealAnswerJsonSchema: { name: string; strict: true; schema: Record<string, unknown> } = {
  name: "interview_prep_single_answer",
  strict: true,
  schema: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["technical", "star"] },
      technical: {
        type: ["object", "null"],
        properties: technicalAnswerJsonSchema.properties,
        required: technicalAnswerJsonSchema.required,
        additionalProperties: false,
      },
      star: {
        type: ["object", "null"],
        properties: starAnswerJsonSchema.properties,
        required: starAnswerJsonSchema.required,
        additionalProperties: false,
      },
    },
    required: ["format", "technical", "star"],
    additionalProperties: false,
  },
};

export { idealAnswerJsonSchema as IDEAL_ANSWER_JSON_SCHEMA };

// ---------------------------------------------------------------------------
// Deterministic sections — never sent through response_format.
// ---------------------------------------------------------------------------

export const readinessScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  resumeQuality: z.number().min(0).max(100),
  jdMatch: z.number().min(0).max(100),
  missingSkillsPenalty: z.number().min(0).max(100),
  projectsScore: z.number().min(0).max(100),
  experienceScore: z.number().min(0).max(100),
  atsScore: z.number().min(0).max(100),
  knowledgeBaseCoverage: z.number().min(0).max(100),
});

export const weaknessAnalysisSchema = z.object({
  weakAreas: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  knowledgeGaps: z.array(z.string()).default([]),
  projectsToBuild: z.array(z.string()).default([]),
  conceptsToLearn: z.array(z.string()).default([]),
});

export const confidenceAnalysisSchema = z.object({
  strongAreas: z.array(z.string()).default([]),
  weakAreas: z.array(z.string()).default([]),
  highConfidenceTopics: z.array(z.string()).default([]),
  lowConfidenceTopics: z.array(z.string()).default([]),
});

export const codingRecommendationSchema = z.object({
  topic: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  platforms: z.array(z.string()).default([]),
  practiceNote: z.string(),
});

export const learningPlanSchema = z.object({
  days: z.union([z.literal(7), z.literal(15), z.literal(30), z.literal(60)]),
  focus: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
  courses: z.array(z.string()).default([]),
  documentation: z.array(z.string()).default([]),
  interviewPracticeNotes: z.array(z.string()).default([]),
});

export const cheatSheetEntrySchema = z.object({
  technology: z.string(),
  points: z.array(z.string()).default([]),
});

export type ReadinessScore = z.infer<typeof readinessScoreSchema>;
export type WeaknessAnalysis = z.infer<typeof weaknessAnalysisSchema>;
export type ConfidenceAnalysis = z.infer<typeof confidenceAnalysisSchema>;
export type CodingRecommendation = z.infer<typeof codingRecommendationSchema>;
export type LearningPlan = z.infer<typeof learningPlanSchema>;
export type CheatSheetEntry = z.infer<typeof cheatSheetEntrySchema>;

// ---------------------------------------------------------------------------
// Final assembled report.
// ---------------------------------------------------------------------------

export const interviewPreparationReportSchema = z.object({
  readinessScore: readinessScoreSchema,
  technicalQuestions: z.array(z.union([technicalQuestionItemSchema, knowledgeBaseQuestionSchema])).default([]),
  hrQuestions: z.array(hrQuestionItemSchema).default([]),
  projectQuestions: z.array(projectQuestionItemSchema).default([]),
  systemDesignQuestions: z.array(systemDesignQuestionItemSchema).default([]),
  codingRecommendations: z.array(codingRecommendationSchema).default([]),
  weaknessAnalysis: weaknessAnalysisSchema,
  confidenceAnalysis: confidenceAnalysisSchema,
  learningRoadmap: z.array(learningPlanSchema).default([]),
  cheatSheet: z.array(cheatSheetEntrySchema).default([]),
});

export type InterviewPreparationReport = z.infer<typeof interviewPreparationReportSchema>;

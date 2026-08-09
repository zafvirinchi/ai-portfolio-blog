import { z } from "zod";

import { learningPlanSchema } from "../interview-prep/prep-schema";

// Phase 13 Milestone 4. Same split every milestone in this arc uses: a
// "raw LLM output" schema tied to response_format, and a richer "final"
// schema that adds deterministic post-processing (here: overallScore,
// computed by answer-evaluator.ts from the raw per-dimension scores —
// never itself asked of the model).

export const INTERVIEW_TYPES = [
  "Technical",
  "HR",
  "Behavioral",
  "System Design",
  "Coding Discussion",
  "Project Deep Dive",
  "Leadership",
  "Architecture",
  "Mixed",
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const SESSION_MODES = ["practice", "interview"] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

export const SESSION_STATUSES = ["not_started", "in_progress", "paused", "completed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const QUESTION_SOURCES = ["knowledge-base", "prep", "resume", "jd", "ai-generated"] as const;
export type MockQuestionSource = (typeof QUESTION_SOURCES)[number];

export const sessionQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(INTERVIEW_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  source: z.enum(QUESTION_SOURCES),
  topic: z.string(),
});

export type SessionQuestion = z.infer<typeof sessionQuestionSchema>;

// ---------------------------------------------------------------------------
// Answer evaluation — the one real per-turn LLM call (evaluation-agent.ts).
// Every dimension is nullable: only the ones relevant to the question's
// type are scored, the rest come back null (a Behavioral question is never
// scored on "security"/"performance"). answer-evaluator.ts computes the
// single weighted overallScore from whichever dimensions are non-null.
// ---------------------------------------------------------------------------

export const ANSWER_DIMENSIONS = [
  "correctness",
  "completeness",
  "communication",
  "confidence",
  "technicalAccuracy",
  "problemSolving",
  "architectureThinking",
  "tradeoffs",
  "bestPractices",
  "security",
  "performance",
  "maintainability",
] as const;
export type AnswerDimension = (typeof ANSWER_DIMENSIONS)[number];

// Which of the 12 dimensions actually apply to each interview type — the
// single source of truth shared by evaluation-agent.ts (tells the model
// which fields to fill vs. leave null) and answer-evaluator.ts (weights
// the overallScore only over the dimensions relevant to the question that
// was actually asked, since a Behavioral question was never going to get a
// meaningful "security" score).
export const DIMENSIONS_BY_TYPE: Record<InterviewType, readonly AnswerDimension[]> = {
  Technical: ["correctness", "completeness", "technicalAccuracy", "bestPractices", "problemSolving", "performance"],
  HR: ["completeness", "communication", "confidence"],
  Behavioral: ["completeness", "communication", "confidence"],
  "System Design": [
    "correctness",
    "completeness",
    "architectureThinking",
    "tradeoffs",
    "bestPractices",
    "performance",
    "security",
    "maintainability",
  ],
  "Coding Discussion": ["correctness", "completeness", "problemSolving", "technicalAccuracy", "performance"],
  "Project Deep Dive": ["completeness", "communication", "architectureThinking", "tradeoffs", "problemSolving"],
  Leadership: ["completeness", "communication", "confidence"],
  Architecture: ["correctness", "architectureThinking", "tradeoffs", "bestPractices", "security", "performance", "maintainability"],
  Mixed: [...ANSWER_DIMENSIONS],
};

export const answerScoreDimensionsSchema = z.object({
  correctness: z.number().min(0).max(100).nullable(),
  completeness: z.number().min(0).max(100).nullable(),
  communication: z.number().min(0).max(100).nullable(),
  confidence: z.number().min(0).max(100).nullable(),
  technicalAccuracy: z.number().min(0).max(100).nullable(),
  problemSolving: z.number().min(0).max(100).nullable(),
  architectureThinking: z.number().min(0).max(100).nullable(),
  tradeoffs: z.number().min(0).max(100).nullable(),
  bestPractices: z.number().min(0).max(100).nullable(),
  security: z.number().min(0).max(100).nullable(),
  performance: z.number().min(0).max(100).nullable(),
  maintainability: z.number().min(0).max(100).nullable(),
});

export type AnswerScoreDimensions = z.infer<typeof answerScoreDimensionsSchema>;

export const answerEvaluationRawSchema = z.object({
  dimensions: answerScoreDimensionsSchema,
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  missingConcepts: z.array(z.string()).default([]),
  betterAnswer: z.string(),
  idealAnswer: z.string(),
  improvementTips: z.array(z.string()).default([]),
  followUpNeeded: z.boolean(),
  followUpQuestion: z.string().nullable(),
});

export type AnswerEvaluationRaw = z.infer<typeof answerEvaluationRawSchema>;

export const answerEvaluationSchema = answerEvaluationRawSchema.extend({
  overallScore: z.number().min(0).max(100),
});

export type AnswerEvaluation = z.infer<typeof answerEvaluationSchema>;

const dimensionsJsonSchema = {
  type: "object",
  properties: Object.fromEntries(ANSWER_DIMENSIONS.map((dimension) => [dimension, { type: ["number", "null"] }])),
  required: [...ANSWER_DIMENSIONS],
  additionalProperties: false,
};

export const ANSWER_EVALUATION_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "mock_interview_answer_evaluation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      dimensions: dimensionsJsonSchema,
      strengths: { type: "array", items: { type: "string" } },
      weaknesses: { type: "array", items: { type: "string" } },
      missingConcepts: { type: "array", items: { type: "string" } },
      betterAnswer: { type: "string" },
      idealAnswer: { type: "string" },
      improvementTips: { type: "array", items: { type: "string" } },
      followUpNeeded: { type: "boolean" },
      followUpQuestion: { type: ["string", "null"] },
    },
    required: [
      "dimensions",
      "strengths",
      "weaknesses",
      "missingConcepts",
      "betterAnswer",
      "idealAnswer",
      "improvementTips",
      "followUpNeeded",
      "followUpQuestion",
    ],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// question-selector.ts's LLM fallback — a single question, only reached
// when the Knowledge Base / prep report / resume / JD sources are exhausted
// for the requested type+difficulty.
// ---------------------------------------------------------------------------

export const fallbackQuestionSchema = z.object({
  question: z.string(),
  topic: z.string(),
});

export type FallbackQuestion = z.infer<typeof fallbackQuestionSchema>;

export const FALLBACK_QUESTION_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "mock_interview_fallback_question",
  strict: true,
  schema: {
    type: "object",
    properties: {
      question: { type: "string" },
      topic: { type: "string" },
    },
    required: ["question", "topic"],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Transcript + final report — all deterministic assembly, never sent
// through response_format.
// ---------------------------------------------------------------------------

export const transcriptTurnSchema = z.object({
  question: sessionQuestionSchema,
  answerText: z.string(),
  evaluation: answerEvaluationSchema,
  isFollowUp: z.boolean(),
  askedAt: z.string(),
  answeredAt: z.string(),
});

export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>;

export const CATEGORY_KEYS = [
  "technical",
  "communication",
  "problemSolving",
  "architecture",
  "leadership",
  "confidence",
  "coding",
  "behavioral",
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const categoryScoresSchema = z.object({
  technical: z.number().min(0).max(100),
  communication: z.number().min(0).max(100),
  problemSolving: z.number().min(0).max(100),
  architecture: z.number().min(0).max(100),
  leadership: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  coding: z.number().min(0).max(100),
  behavioral: z.number().min(0).max(100),
});

export type CategoryScores = z.infer<typeof categoryScoresSchema>;

export const topicScoreSchema = z.object({
  topic: z.string(),
  score: z.number().min(0).max(100),
});

export type TopicScore = z.infer<typeof topicScoreSchema>;

export const sessionReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  interviewReadiness: z.number().min(0).max(100),
  categoryScores: categoryScoresSchema,
  topicScores: z.array(topicScoreSchema).default([]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  topImprovements: z.array(z.string()).default([]),
  questionsMissed: z.array(z.string()).default([]),
  // Reuses interview-prep's own (protected, unmodified) learningPlanSchema
  // — read-only reuse, same as this package reusing buildLearningRoadmap()
  // itself rather than re-implementing roadmap bucketing.
  learningRoadmap: z.array(learningPlanSchema).default([]),
});

export type SessionReport = z.infer<typeof sessionReportSchema>;

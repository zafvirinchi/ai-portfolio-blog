import { z } from "zod";

import { ratedDimensionSchema, RATING_LEVELS } from "../recruiter/candidate-schema";

// Phase 13 Milestone 9. Builds the hiring pipeline on top of Milestone
// 8's candidate pool (read-only reuse of ratedDimensionSchema/
// RATING_LEVELS below — not a duplicate definition).

export const JOB_STATUSES = ["Draft", "Open", "Closed", "Archived"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Remote"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

// The spec's own linear order (used for funnel/time-to-hire math) plus
// "Rejected" as a side-branch terminal reachable from any point — real
// hiring workflows reject at any stage, not only at the end.
export const PIPELINE_STAGES = [
  "Applied",
  "Screening",
  "ATS Passed",
  "Technical Interview",
  "Manager Interview",
  "HR Interview",
  "Offer",
  "Hired",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const CANDIDATE_STAGES = [...PIPELINE_STAGES, "Rejected"] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export const INTERVIEW_TYPES = ["Technical", "Managerial", "HR", "Final Round"] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_STATUSES = ["Scheduled", "Completed", "Cancelled", "No-Show"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const OFFER_STATUSES = ["Draft", "Sent", "Accepted", "Declined", "Rescinded"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

// The spec's exact 5 notification type names.
export const NOTIFICATION_TYPES = [
  "Interview Scheduled",
  "Interview Completed",
  "Offer Generated",
  "Candidate Moved",
  "New Resume Uploaded",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Labeling only, not authentication — see plan design decision 5.
export const ACTING_ROLES = ["Recruiter", "Hiring Manager", "HR", "Admin"] as const;
export type ActingRole = (typeof ACTING_ROLES)[number];

export const HIRING_CLASSIFICATIONS = ["Hire Immediately", "Strong Match", "Needs Review"] as const;
export type HiringClassification = (typeof HIRING_CLASSIFICATIONS)[number];

// ---------------------------------------------------------------------------
// Hiring recommendation — one call per pipeline candidate, job-specific.
// ---------------------------------------------------------------------------

export const hiringRecommendationLlmOutputSchema = z.object({
  classification: z.enum(HIRING_CLASSIFICATIONS),
  culturalFit: ratedDimensionSchema,
  technicalSkills: ratedDimensionSchema,
  leadershipPotential: ratedDimensionSchema,
  riskFactors: z.array(z.string()).default([]),
  expectedLearningCurve: z.string(),
});
export type HiringRecommendation = z.infer<typeof hiringRecommendationLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Interview kit — checklist + AI questions + evaluation form, one call.
// ---------------------------------------------------------------------------

export const interviewQuestionSchema = z.object({
  question: z.string(),
  category: z.string(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
});
export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>;

export const evaluationCriterionSchema = z.object({
  criterion: z.string(),
  description: z.string(),
  weight: z.number().min(0).max(100),
});
export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>;

export const interviewKitLlmOutputSchema = z.object({
  checklist: z.array(z.string()).default([]),
  questions: z.array(interviewQuestionSchema).default([]),
  evaluationForm: z.array(evaluationCriterionSchema).default([]),
});
export type InterviewKit = z.infer<typeof interviewKitLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Feedback summary — one call, grounded strictly in the recruiter's own
// recorded notes (never inventing new performance claims).
// ---------------------------------------------------------------------------

export const feedbackSummaryLlmOutputSchema = z.object({
  summary: z.string(),
  recommendation: z.string(),
});
export type FeedbackSummary = z.infer<typeof feedbackSummaryLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Email generation — one shared shape reused by all 5 email types.
// ---------------------------------------------------------------------------

export const emailLlmOutputSchema = z.object({
  subject: z.string(),
  body: z.string(),
});
export type EmailContent = z.infer<typeof emailLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Hand-written strict JSON Schema mirrors (OpenAI Structured Outputs).
// ---------------------------------------------------------------------------

type JsonSchemaSpec = { name: string; strict: true; schema: Record<string, unknown> };

const STRING_ARRAY = { type: "array", items: { type: "string" } } as const;

const ratedDimensionJsonSchema = {
  type: "object",
  properties: {
    rating: { type: "string", enum: [...RATING_LEVELS] },
    explanation: { type: "string" },
  },
  required: ["rating", "explanation"],
  additionalProperties: false,
};

export const HIRING_RECOMMENDATION_JSON_SCHEMA: JsonSchemaSpec = {
  name: "hiring_recommendation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      classification: { type: "string", enum: [...HIRING_CLASSIFICATIONS] },
      culturalFit: ratedDimensionJsonSchema,
      technicalSkills: ratedDimensionJsonSchema,
      leadershipPotential: ratedDimensionJsonSchema,
      riskFactors: STRING_ARRAY,
      expectedLearningCurve: { type: "string" },
    },
    required: ["classification", "culturalFit", "technicalSkills", "leadershipPotential", "riskFactors", "expectedLearningCurve"],
    additionalProperties: false,
  },
};

const interviewQuestionJsonSchema = {
  type: "object",
  properties: {
    question: { type: "string" },
    category: { type: "string" },
    difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
  },
  required: ["question", "category", "difficulty"],
  additionalProperties: false,
};

const evaluationCriterionJsonSchema = {
  type: "object",
  properties: {
    criterion: { type: "string" },
    description: { type: "string" },
    weight: { type: "number" },
  },
  required: ["criterion", "description", "weight"],
  additionalProperties: false,
};

export const INTERVIEW_KIT_JSON_SCHEMA: JsonSchemaSpec = {
  name: "interview_kit",
  strict: true,
  schema: {
    type: "object",
    properties: {
      checklist: STRING_ARRAY,
      questions: { type: "array", items: interviewQuestionJsonSchema },
      evaluationForm: { type: "array", items: evaluationCriterionJsonSchema },
    },
    required: ["checklist", "questions", "evaluationForm"],
    additionalProperties: false,
  },
};

export const FEEDBACK_SUMMARY_JSON_SCHEMA: JsonSchemaSpec = {
  name: "interview_feedback_summary",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      recommendation: { type: "string" },
    },
    required: ["summary", "recommendation"],
    additionalProperties: false,
  },
};

export const EMAIL_JSON_SCHEMA: JsonSchemaSpec = {
  name: "recruitment_email",
  strict: true,
  schema: {
    type: "object",
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["subject", "body"],
    additionalProperties: false,
  },
};

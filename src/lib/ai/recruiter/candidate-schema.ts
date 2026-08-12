import { z } from "zod";

// Phase 13 Milestone 8. This package writes third-person analysis ABOUT
// a candidate (insights, comparison narratives, recommendations) rather
// than first-person candidate-authored content (a cover letter, a
// LinkedIn About section) — lower fabrication stakes than those
// packages, so each generator carries its own lighter in-prompt
// grounding instruction instead of a dedicated validator.ts (not in
// this milestone's own 11-file list).

export const CANDIDATE_STATUSES = [
  "Pending Review",
  "Shortlisted",
  "Interview Scheduled",
  "On Hold",
  "Offer",
  "Hired",
  "Rejected",
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/**
 * Phase 16 Milestone 7, §1 — audited first: this existing 7-value enum
 * already covers the requested NEW/EVALUATED/SHORTLISTED/REVIEW/
 * INTERVIEW/REJECTED/HIRED workflow (Pending Review ≈ New/Review — the
 * status every candidate starts at; "Evaluated" is not a status at all,
 * it's the separate, already-existing EvaluationStatus field from
 * Milestone 4; Shortlisted/Interview Scheduled/Rejected/Hired already
 * exist verbatim). No status was added, renamed, or removed — this is
 * purely a transition GRAPH over the existing enum, preserving full
 * backward compatibility.
 *
 * Deterministic, server-validated rules (§1/§6): every status can move
 * directly to Rejected (a recruiter can reject at any stage); Hired
 * and Rejected are near-terminal, reopening only to Pending Review (a
 * correction path for mistakes, not a new workflow stage); otherwise
 * transitions follow the natural screening progression. A transition
 * to the SAME status is always valid (see isValidStatusTransition) —
 * required for idempotent shortlist/unshortlist operations (§14).
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<CandidateStatus, CandidateStatus[]> = {
  "Pending Review": ["Shortlisted", "On Hold", "Rejected"],
  Shortlisted: ["Pending Review", "Interview Scheduled", "On Hold", "Rejected"],
  "Interview Scheduled": ["Shortlisted", "Offer", "On Hold", "Rejected"],
  "On Hold": ["Pending Review", "Shortlisted", "Interview Scheduled", "Rejected"],
  Offer: ["Hired", "On Hold", "Rejected"],
  Hired: ["Pending Review"],
  Rejected: ["Pending Review"],
};

export function isValidStatusTransition(from: CandidateStatus, to: CandidateStatus): boolean {
  return from === to || ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

// The spec's fixed 12-tag palette — closed-set, no arbitrary custom tags.
export const CANDIDATE_TAGS = [
  "Backend",
  "Frontend",
  "AI",
  "Cloud",
  "DevOps",
  "Java",
  "Angular",
  "Spring",
  "Leadership",
  "Remote",
  "Visa",
  "Immediate Joiner",
] as const;
export type CandidateTag = (typeof CANDIDATE_TAGS)[number];

export const NOTE_CATEGORIES = ["Recruiter", "Interview", "Technical", "Manager"] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export const noteEntrySchema = z.object({
  id: z.string(),
  category: z.enum(NOTE_CATEGORIES),
  text: z.string(),
  createdAt: z.string(),
});
export type NoteEntry = z.infer<typeof noteEntrySchema>;

export const RATING_LEVELS = ["Low", "Medium", "High"] as const;
export type RatingLevel = (typeof RATING_LEVELS)[number];

// ---------------------------------------------------------------------------
// Candidate insights — one call per candidate, bundling all 9 spec-named
// dimensions (same "bundle related short fields into one call" shape
// every other milestone in this arc uses).
// ---------------------------------------------------------------------------

export const ratedDimensionSchema = z.object({
  rating: z.enum(RATING_LEVELS),
  explanation: z.string(),
});
export type RatedDimension = z.infer<typeof ratedDimensionSchema>;

export const candidateInsightsLlmOutputSchema = z.object({
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  riskFactors: z.array(z.string()).default([]),
  hiringRecommendation: ratedDimensionSchema,
  leadershipPotential: ratedDimensionSchema,
  careerGrowth: ratedDimensionSchema,
  learningAbility: ratedDimensionSchema,
  cultureFit: ratedDimensionSchema,
  technicalDepth: ratedDimensionSchema,
});
export type CandidateInsights = z.infer<typeof candidateInsightsLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Comparison recommendation — one call, narrating an already-computed
// deterministic comparison table (candidate-comparison.ts). Never invents
// new facts, only explains numbers that already exist.
// ---------------------------------------------------------------------------

export const comparisonCandidateNoteSchema = z.object({
  candidateId: z.string(),
  keyDifferentiators: z.array(z.string()).default([]),
});
export type ComparisonCandidateNote = z.infer<typeof comparisonCandidateNoteSchema>;

export const comparisonRecommendationLlmOutputSchema = z.object({
  recommendation: z.string(),
  rankingRationale: z.string(),
  perCandidateNotes: z.array(comparisonCandidateNoteSchema).default([]),
});
export type ComparisonRecommendation = z.infer<typeof comparisonRecommendationLlmOutputSchema>;

// ---------------------------------------------------------------------------
// Top-candidates recommendation — one call narrating a deterministic
// top-N ranking slice (candidate-ranking.ts). Reused by both the UI
// Recommendations panel and the chat "recommend top 5 candidates" command.
// ---------------------------------------------------------------------------

export const topCandidatesRecommendationLlmOutputSchema = z.object({
  summary: z.string(),
});
export type TopCandidatesRecommendationLlmOutput = z.infer<typeof topCandidatesRecommendationLlmOutputSchema>;

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

export const CANDIDATE_INSIGHTS_JSON_SCHEMA: JsonSchemaSpec = {
  name: "candidate_insights",
  strict: true,
  schema: {
    type: "object",
    properties: {
      strengths: STRING_ARRAY,
      weaknesses: STRING_ARRAY,
      riskFactors: STRING_ARRAY,
      hiringRecommendation: ratedDimensionJsonSchema,
      leadershipPotential: ratedDimensionJsonSchema,
      careerGrowth: ratedDimensionJsonSchema,
      learningAbility: ratedDimensionJsonSchema,
      cultureFit: ratedDimensionJsonSchema,
      technicalDepth: ratedDimensionJsonSchema,
    },
    required: [
      "strengths",
      "weaknesses",
      "riskFactors",
      "hiringRecommendation",
      "leadershipPotential",
      "careerGrowth",
      "learningAbility",
      "cultureFit",
      "technicalDepth",
    ],
    additionalProperties: false,
  },
};

const comparisonCandidateNoteJsonSchema = {
  type: "object",
  properties: {
    candidateId: { type: "string" },
    keyDifferentiators: STRING_ARRAY,
  },
  required: ["candidateId", "keyDifferentiators"],
  additionalProperties: false,
};

export const COMPARISON_RECOMMENDATION_JSON_SCHEMA: JsonSchemaSpec = {
  name: "candidate_comparison_recommendation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      recommendation: { type: "string" },
      rankingRationale: { type: "string" },
      perCandidateNotes: { type: "array", items: comparisonCandidateNoteJsonSchema },
    },
    required: ["recommendation", "rankingRationale", "perCandidateNotes"],
    additionalProperties: false,
  },
};

export const TOP_CANDIDATES_RECOMMENDATION_JSON_SCHEMA: JsonSchemaSpec = {
  name: "top_candidates_recommendation",
  strict: true,
  schema: {
    type: "object",
    properties: { summary: { type: "string" } },
    required: ["summary"],
    additionalProperties: false,
  },
};

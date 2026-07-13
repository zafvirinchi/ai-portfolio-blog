import { z } from "zod";

// Structured-output schemas for the three specialist agents. Each pairs a
// Zod schema (runtime validation) with a hand-written mirror JSON Schema
// for OpenAI's strict Structured Outputs mode — same split as
// planner/planner-schema.ts and resume/resume-schema.ts, and for the same
// reason: strict mode only supports a constrained JSON Schema subset (no
// min/max, no derived-from-Zod generation), so the two are kept explicit
// and independently auditable rather than relying on automatic conversion.

// ---------------------------------------------------------------------------
// Research Agent
// ---------------------------------------------------------------------------

export const researchOutputSchema = z.object({
  missingInformation: z.array(z.string()).default([]),
  inconsistencies: z.array(z.string()).default([]),
  unsupportedClaims: z.array(z.string()).default([]),
  suggestedEvidence: z.array(z.string()).default([]),
});

export type ResearchOutput = z.infer<typeof researchOutputSchema>;

export const RESEARCH_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "research_output",
  strict: true,
  schema: {
    type: "object",
    properties: {
      missingInformation: { type: "array", items: { type: "string" } },
      inconsistencies: { type: "array", items: { type: "string" } },
      unsupportedClaims: { type: "array", items: { type: "string" } },
      suggestedEvidence: { type: "array", items: { type: "string" } },
    },
    required: ["missingInformation", "inconsistencies", "unsupportedClaims", "suggestedEvidence"],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Reviewer Agent
// ---------------------------------------------------------------------------

export const HALLUCINATION_RISK_LEVELS = ["low", "medium", "high"] as const;

export const reviewOutputSchema = z.object({
  hallucinationRisk: z.enum(HALLUCINATION_RISK_LEVELS),
  contradictions: z.array(z.string()).default([]),
  missingReferences: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  qualityNotes: z.array(z.string()).default([]),
});

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export const REVIEW_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "review_output",
  strict: true,
  schema: {
    type: "object",
    properties: {
      hallucinationRisk: { type: "string", enum: [...HALLUCINATION_RISK_LEVELS] },
      contradictions: { type: "array", items: { type: "string" } },
      missingReferences: { type: "array", items: { type: "string" } },
      confidence: { type: "number" },
      qualityNotes: { type: "array", items: { type: "string" } },
    },
    required: ["hallucinationRisk", "contradictions", "missingReferences", "confidence", "qualityNotes"],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Summarizer Agent
// ---------------------------------------------------------------------------

export const summaryOutputSchema = z.object({
  mergedContext: z.string(),
});

export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

export const SUMMARY_JSON_SCHEMA: {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} = {
  name: "summary_output",
  strict: true,
  schema: {
    type: "object",
    properties: {
      mergedContext: { type: "string" },
    },
    required: ["mergedContext"],
    additionalProperties: false,
  },
};

import { z } from "zod";

// Phase 14 Milestone 4. Snake_case kept verbatim for row shapes,
// matching src/lib/saas/organization-schema.ts's and
// src/lib/billing/billing-schema.ts's established convention.

export const USAGE_FEATURE_KEYS = [
  "AI_CHAT",
  "RESUME_PARSER",
  "RESUME_ANALYSIS",
  "ATS_ANALYSIS",
  "JD_MATCHING",
  "RESUME_REWRITE",
  "INTERVIEW_GENERATION",
  "INTERVIEW_EVALUATION",
  "MOCK_INTERVIEW",
  "KNOWLEDGE_INGESTION",
  "KNOWLEDGE_SEARCH",
  "MULTI_AGENT_RESEARCH",
  "MULTI_AGENT_REVIEW",
  "MULTI_AGENT_SUMMARY",
] as const;
export type UsageFeatureKey = (typeof USAGE_FEATURE_KEYS)[number];

export const USAGE_OPERATION_KEYS = [
  "LLM_CALL",
  "EMBEDDING",
  "DOCUMENT_PARSE",
  "ATS_CALCULATION",
  "JD_ANALYSIS",
  "REWRITE",
  "INTERVIEW_GENERATION",
  "INTERVIEW_EVALUATION",
  "RAG_SEARCH",
] as const;
export type UsageOperationKey = (typeof USAGE_OPERATION_KEYS)[number];

export const USAGE_TRANSACTION_STATUSES = ["reserved", "committed", "released", "failed"] as const;
export type UsageTransactionStatus = (typeof USAGE_TRANSACTION_STATUSES)[number];

export const USAGE_RECORD_STATUSES = ["success", "failed", "blocked"] as const;
export type UsageRecordStatus = (typeof USAGE_RECORD_STATUSES)[number];

export const COST_MODES = ["token", "fixed", "hybrid"] as const;
export type CostMode = (typeof COST_MODES)[number];

// ---------------------------------------------------------------------------
// Admin config update schemas (minimal config UI — see /admin/usage).
// ---------------------------------------------------------------------------

export const updateModelPricingSchema = z.object({
  model: z.string().min(1),
  inputPricePerMillionCents: z.number().nonnegative(),
  outputPricePerMillionCents: z.number().nonnegative(),
});

export const updateFeatureCostSchema = z.object({
  feature: z.enum(USAGE_FEATURE_KEYS),
  fixedCredits: z.number().int().nonnegative(),
});

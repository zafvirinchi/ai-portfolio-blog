import { PlanKey } from "../../billing/billing-schema";

import { CostMode, UsageFeatureKey, UsageOperationKey } from "./usage-schema";
import { CreditRule, FeatureCost, ModelPricing } from "./usage-types";

const LOG_PREFIX = "[ai-usage]";

// ---------------------------------------------------------------------------
// Model pricing — configuration-driven, one place, never scattered into
// feature code. Values are illustrative public list prices (cents per
// million tokens) — editable at runtime via /admin/usage's minimal
// config UI (updateModelPricing() below), not a rebuild.
// ---------------------------------------------------------------------------

const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini": { model: "gpt-4o-mini", inputPricePerMillionCents: 15, outputPricePerMillionCents: 60 },
  "text-embedding-3-small": { model: "text-embedding-3-small", inputPricePerMillionCents: 2, outputPricePerMillionCents: 0 },
};

const FALLBACK_MODEL_PRICING: ModelPricing = { model: "unknown", inputPricePerMillionCents: 15, outputPricePerMillionCents: 60 };

// Mutable at runtime (admin config UI) — starts from the defaults above.
const modelPricing = new Map<string, ModelPricing>(Object.entries(DEFAULT_MODEL_PRICING));

export function getModelPricing(model: string): ModelPricing {
  return modelPricing.get(model) ?? { ...FALLBACK_MODEL_PRICING, model };
}

export function listModelPricing(): ModelPricing[] {
  return [...modelPricing.values()];
}

export function updateModelPricing(pricing: ModelPricing): void {
  modelPricing.set(pricing.model, pricing);
  console.log(`${LOG_PREFIX} Model pricing updated`, { model: pricing.model });
}

// ---------------------------------------------------------------------------
// Fixed per-feature costs — used for operations with no meaningful
// token count (e.g. deterministic document parsing) instead of
// token-based pricing.
// ---------------------------------------------------------------------------

const DEFAULT_FEATURE_COSTS: Record<UsageFeatureKey, number> = {
  AI_CHAT: 1,
  RESUME_PARSER: 2,
  RESUME_ANALYSIS: 3,
  ATS_ANALYSIS: 2,
  JD_MATCHING: 3,
  RESUME_REWRITE: 4,
  INTERVIEW_GENERATION: 3,
  INTERVIEW_EVALUATION: 2,
  MOCK_INTERVIEW: 3,
  KNOWLEDGE_INGESTION: 2,
  KNOWLEDGE_SEARCH: 1,
  MULTI_AGENT_RESEARCH: 3,
  MULTI_AGENT_REVIEW: 2,
  MULTI_AGENT_SUMMARY: 2,
};

const featureCosts = new Map<UsageFeatureKey, number>(Object.entries(DEFAULT_FEATURE_COSTS) as [UsageFeatureKey, number][]);

export function getFeatureCost(feature: UsageFeatureKey): FeatureCost {
  return { feature, fixedCredits: featureCosts.get(feature) ?? 1 };
}

export function listFeatureCosts(): FeatureCost[] {
  return [...featureCosts.entries()].map(([feature, fixedCredits]) => ({ feature, fixedCredits }));
}

export function updateFeatureCost(feature: UsageFeatureKey, fixedCredits: number): void {
  featureCosts.set(feature, fixedCredits);
  console.log(`${LOG_PREFIX} Feature cost updated`, { feature, fixedCredits });
}

// ---------------------------------------------------------------------------
// Cost mode per (feature, operation) — token-based for real LLM/embedding
// calls, fixed for deterministic operations, hybrid falls back to fixed
// when a response carries no usable token count.
// ---------------------------------------------------------------------------

const TOKEN_BASED_OPERATIONS = new Set<UsageOperationKey>(["LLM_CALL", "EMBEDDING"]);

export function getCreditRule(feature: UsageFeatureKey, operation: UsageOperationKey): CreditRule {
  const costMode: CostMode = TOKEN_BASED_OPERATIONS.has(operation) ? "hybrid" : "fixed";
  return { feature, operation, costMode, fixedCredits: getFeatureCost(feature).fixedCredits };
}

// $ → credits conversion — one constant, not scattered. 100 credits per
// dollar (i.e. 1 credit = $0.01 of underlying model cost).
export const CREDITS_PER_DOLLAR = 100;

// ---------------------------------------------------------------------------
// Plan-level monthly credit pool — Subscription architecture (Milestone
// 3) is protected, so this lives here as this milestone's own static
// config, keyed off M3's PlanKey (read-only type import) rather than
// injected into plan-service.ts's PLAN_DEFINITIONS or the `plans` table.
// ---------------------------------------------------------------------------

export const MONTHLY_CREDIT_ALLOWANCE: Record<PlanKey, number | null> = {
  free: 500,
  professional: 5000,
  premium: 20000,
  enterprise: null,
};

// ---------------------------------------------------------------------------
// Enforcement toggle — AI_USAGE_ENFORCEMENT=false is only honored
// outside production, so this repo's free/local dev environments never
// get blocked just because the billing tables are empty, while
// production can never silently disable enforcement.
// ---------------------------------------------------------------------------

export function isEnforcementEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return process.env.AI_USAGE_ENFORCEMENT !== "false";
}

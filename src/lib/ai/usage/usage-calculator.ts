import { UsageFeatureKey } from "./usage-schema";
import { UsageCost } from "./usage-types";
import { CREDITS_PER_DOLLAR, getFeatureCost, getModelPricing } from "./usage-policy";

function centsToCredits(cents: number): number {
  // CREDITS_PER_DOLLAR credits per 100 cents ⇒ credits = cents * (CREDITS_PER_DOLLAR / 100).
  return Math.max(1, Math.ceil((cents * CREDITS_PER_DOLLAR) / 100));
}

/** Token-based cost: input tokens × input price + output tokens × output price, converted from monetary cost to internal credits. */
export function calculateTokenCost(model: string, inputTokens: number, outputTokens: number): UsageCost {
  const pricing = getModelPricing(model);

  const inputCents = (inputTokens / 1_000_000) * pricing.inputPricePerMillionCents;
  const outputCents = (outputTokens / 1_000_000) * pricing.outputPricePerMillionCents;
  const totalCents = inputCents + outputCents;

  return {
    credits: centsToCredits(totalCents),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    model,
    estimatedCostCents: totalCents,
  };
}

/** Operation-based fixed cost — used for deterministic operations with no meaningful token count. */
export function calculateFixedCost(feature: UsageFeatureKey): UsageCost {
  return { credits: getFeatureCost(feature).fixedCredits };
}

/** Hybrid: token-based when real usage numbers are available, falling back to the feature's fixed cost otherwise (e.g. a response with no usage field). */
export function calculateHybridCost(
  feature: UsageFeatureKey,
  model: string | undefined,
  inputTokens: number | undefined,
  outputTokens: number | undefined
): UsageCost {
  if (model && typeof inputTokens === "number" && typeof outputTokens === "number") {
    return calculateTokenCost(model, inputTokens, outputTokens);
  }

  return calculateFixedCost(feature);
}

/**
 * Pre-call reservation estimate — a safe, simple upper-bound-ish
 * number (the feature's configured fixed cost) reserved BEFORE the
 * real OpenAI call, since real token counts aren't known yet. The
 * actual cost (usually different, computed post-call from real
 * response.usage) is what gets committed — see the reserve → commit
 * reconciliation in credit-service.ts/usage-service.ts.
 */
export function estimateReservation(feature: UsageFeatureKey): number {
  return getFeatureCost(feature).fixedCredits;
}

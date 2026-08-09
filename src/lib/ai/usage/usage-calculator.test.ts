import { describe, expect, it } from "vitest";

import { calculateFixedCost, calculateHybridCost, calculateTokenCost, estimateReservation } from "./usage-calculator";
import { getFeatureCost, updateModelPricing } from "./usage-policy";

describe("calculateTokenCost", () => {
  it("converts token counts to credits via configured model pricing", () => {
    // gpt-4o-mini: 15c/1M input, 60c/1M output (usage-policy.ts defaults).
    // 1,000,000 input + 1,000,000 output tokens = 15c + 60c = 75c = ceil(75 * 100/100) = 75 credits.
    const cost = calculateTokenCost("gpt-4o-mini", 1_000_000, 1_000_000);

    expect(cost.credits).toBe(75);
    expect(cost.inputTokens).toBe(1_000_000);
    expect(cost.outputTokens).toBe(1_000_000);
    expect(cost.totalTokens).toBe(2_000_000);
    expect(cost.model).toBe("gpt-4o-mini");
  });

  it("never rounds a nonzero cost down to 0 credits", () => {
    const cost = calculateTokenCost("gpt-4o-mini", 10, 10);
    expect(cost.credits).toBeGreaterThanOrEqual(1);
  });

  it("falls back to the unknown-model price when the model has no configured pricing", () => {
    const known = calculateTokenCost("gpt-4o-mini", 1_000_000, 0);
    const unknown = calculateTokenCost("some-future-model-xyz", 1_000_000, 0);
    expect(unknown.credits).toBe(known.credits);
  });

  it("reflects admin-updated pricing immediately (config-driven, not hardcoded)", () => {
    updateModelPricing({ model: "test-pricing-model", inputPricePerMillionCents: 100, outputPricePerMillionCents: 0 });
    const cost = calculateTokenCost("test-pricing-model", 1_000_000, 0);
    expect(cost.credits).toBe(100);
  });
});

describe("calculateFixedCost", () => {
  it("returns the feature's configured fixed credit cost", () => {
    expect(calculateFixedCost("KNOWLEDGE_SEARCH").credits).toBe(getFeatureCost("KNOWLEDGE_SEARCH").fixedCredits);
  });
});

describe("calculateHybridCost", () => {
  it("uses token-based pricing when a model and both token counts are present", () => {
    const cost = calculateHybridCost("AI_CHAT", "gpt-4o-mini", 1_000_000, 0);
    expect(cost.model).toBe("gpt-4o-mini");
    expect(cost.credits).toBe(calculateTokenCost("gpt-4o-mini", 1_000_000, 0).credits);
  });

  it("falls back to the feature's fixed cost when usage numbers are missing", () => {
    const cost = calculateHybridCost("AI_CHAT", undefined, undefined, undefined);
    expect(cost.credits).toBe(calculateFixedCost("AI_CHAT").credits);
  });
});

describe("estimateReservation", () => {
  it("matches the feature's configured fixed cost (pre-call estimate, real token counts aren't known yet)", () => {
    expect(estimateReservation("RESUME_REWRITE")).toBe(getFeatureCost("RESUME_REWRITE").fixedCredits);
  });
});

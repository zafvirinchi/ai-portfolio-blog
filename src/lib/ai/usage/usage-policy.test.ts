import { afterEach, describe, expect, it } from "vitest";

import { getCreditRule, getFeatureCost, getModelPricing, isEnforcementEnabled, listFeatureCosts, listModelPricing, updateFeatureCost, updateModelPricing } from "./usage-policy";

describe("model pricing config", () => {
  it("has default pricing for the models this project actually uses", () => {
    expect(getModelPricing("gpt-4o-mini").inputPricePerMillionCents).toBeGreaterThan(0);
    expect(getModelPricing("text-embedding-3-small")).toBeDefined();
  });

  it("updateModelPricing changes pricing at runtime without a rebuild", () => {
    updateModelPricing({ model: "gpt-4o-mini-test-copy", inputPricePerMillionCents: 42, outputPricePerMillionCents: 84 });
    expect(getModelPricing("gpt-4o-mini-test-copy")).toEqual({ model: "gpt-4o-mini-test-copy", inputPricePerMillionCents: 42, outputPricePerMillionCents: 84 });
    expect(listModelPricing()).toContainEqual({ model: "gpt-4o-mini-test-copy", inputPricePerMillionCents: 42, outputPricePerMillionCents: 84 });
  });
});

describe("feature cost config", () => {
  afterEach(() => {
    // Restore — updateFeatureCost mutates module-level shared state.
    updateFeatureCost("AI_CHAT", 1);
  });

  it("has a default fixed cost per feature", () => {
    expect(getFeatureCost("AI_CHAT").fixedCredits).toBe(1);
  });

  it("updateFeatureCost changes cost at runtime without touching feature code", () => {
    updateFeatureCost("AI_CHAT", 5);
    expect(getFeatureCost("AI_CHAT").fixedCredits).toBe(5);
    expect(listFeatureCosts()).toContainEqual({ feature: "AI_CHAT", fixedCredits: 5 });
  });
});

describe("getCreditRule", () => {
  it("uses hybrid (token-based, falling back to fixed) pricing for real LLM/embedding calls", () => {
    expect(getCreditRule("AI_CHAT", "LLM_CALL").costMode).toBe("hybrid");
    expect(getCreditRule("KNOWLEDGE_INGESTION", "EMBEDDING").costMode).toBe("hybrid");
  });

  it("uses fixed pricing for deterministic, non-token operations", () => {
    expect(getCreditRule("RESUME_PARSER", "DOCUMENT_PARSE").costMode).toBe("fixed");
    expect(getCreditRule("ATS_ANALYSIS", "ATS_CALCULATION").costMode).toBe("fixed");
  });
});

describe("isEnforcementEnabled", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.AI_USAGE_ENFORCEMENT;

  afterEach(() => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = originalNodeEnv;
    process.env.AI_USAGE_ENFORCEMENT = originalFlag;
  });

  it("is always enabled in production, even if the dev-only override is set", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    process.env.AI_USAGE_ENFORCEMENT = "false";
    expect(isEnforcementEnabled()).toBe(true);
  });

  it("can be disabled outside production via AI_USAGE_ENFORCEMENT=false", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    process.env.AI_USAGE_ENFORCEMENT = "false";
    expect(isEnforcementEnabled()).toBe(false);
  });

  it("defaults to enabled outside production when the flag is unset", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    delete process.env.AI_USAGE_ENFORCEMENT;
    expect(isEnforcementEnabled()).toBe(true);
  });
});

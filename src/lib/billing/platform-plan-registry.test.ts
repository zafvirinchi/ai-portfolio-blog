import { describe, expect, it } from "vitest";

import { getDefaultPlanForRole, getFeatureEntitlement, PLATFORM_PLAN_DEFINITIONS } from "./platform-plan-registry";
import { FEATURE_IDS, PLATFORM_PLAN_KEYS } from "./platform-schema";

// Phase 18 Milestone 1 — the plan matrix is pure static data; these
// tests guard its own internal consistency (every LIMITED entry carries
// a real limit/period/metric, every plan key resolves) rather than
// re-asserting the specific provisional numbers, which are explicitly
// documented as subject to change before real pricing exists.

describe("PLATFORM_PLAN_DEFINITIONS — structural consistency", () => {
  it("defines exactly the declared plan keys, no more, no fewer", () => {
    expect(Object.keys(PLATFORM_PLAN_DEFINITIONS).sort()).toEqual([...PLATFORM_PLAN_KEYS].sort());
  });

  it("every LIMITED feature entitlement carries a metric, a positive limit, and a period", () => {
    for (const plan of Object.values(PLATFORM_PLAN_DEFINITIONS)) {
      for (const [featureId, entitlement] of Object.entries(plan.features)) {
        if (entitlement.access !== "LIMITED") continue;

        expect(entitlement.metric, `${plan.key}.${featureId} is LIMITED but has no metric`).toBeDefined();
        expect(entitlement.period, `${plan.key}.${featureId} is LIMITED but has no period`).toBeDefined();
        expect(entitlement.limit, `${plan.key}.${featureId} is LIMITED but has no positive limit`).toBeGreaterThan(0);
      }
    }
  });

  it("UNLIMITED/NONE entitlements never carry a stray limit/metric/period", () => {
    for (const plan of Object.values(PLATFORM_PLAN_DEFINITIONS)) {
      for (const entitlement of Object.values(plan.features)) {
        if (entitlement.access === "LIMITED") continue;
        expect(entitlement.limit).toBeUndefined();
        expect(entitlement.metric).toBeUndefined();
      }
    }
  });

  it("every recruiter plan only grants recruiter.* features, never job-seeker ones", () => {
    for (const planKey of ["RECRUITER_FREE", "RECRUITER_PRO", "RECRUITER_BUSINESS"] as const) {
      const grantedFeatures = Object.entries(PLATFORM_PLAN_DEFINITIONS[planKey].features)
        .filter(([, entitlement]) => entitlement.access !== "NONE")
        .map(([featureId]) => featureId);

      expect(grantedFeatures.every((id) => id.startsWith("recruiter."))).toBe(true);
    }
  });

  it("every job-seeker plan only grants resume/job/interview features, never recruiter.*", () => {
    for (const planKey of ["JOB_SEEKER_FREE", "JOB_SEEKER_PRO", "JOB_SEEKER_PREMIUM"] as const) {
      const grantedFeatures = Object.entries(PLATFORM_PLAN_DEFINITIONS[planKey].features)
        .filter(([, entitlement]) => entitlement.access !== "NONE")
        .map(([featureId]) => featureId);

      expect(grantedFeatures.every((id) => !id.startsWith("recruiter."))).toBe(true);
    }
  });

  it("PREMIUM/BUSINESS tiers are never more restrictive than their own FREE tier for the same feature", () => {
    const ACCESS_RANK = { NONE: 0, LIMITED: 1, UNLIMITED: 2 };
    const tiers: [keyof typeof PLATFORM_PLAN_DEFINITIONS, keyof typeof PLATFORM_PLAN_DEFINITIONS][] = [
      ["JOB_SEEKER_FREE", "JOB_SEEKER_PREMIUM"],
      ["RECRUITER_FREE", "RECRUITER_BUSINESS"],
    ];

    for (const [freeKey, topKey] of tiers) {
      for (const featureId of FEATURE_IDS) {
        const freeAccess = getFeatureEntitlement(freeKey, featureId).access;
        const topAccess = getFeatureEntitlement(topKey, featureId).access;
        expect(ACCESS_RANK[topAccess]).toBeGreaterThanOrEqual(ACCESS_RANK[freeAccess]);
      }
    }
  });
});

describe("getDefaultPlanForRole", () => {
  it("resolves JOB_SEEKER to JOB_SEEKER_FREE and RECRUITER to RECRUITER_FREE — always the FREE tier, never a paid one", () => {
    expect(getDefaultPlanForRole("JOB_SEEKER")).toBe("JOB_SEEKER_FREE");
    expect(getDefaultPlanForRole("RECRUITER")).toBe("RECRUITER_FREE");
  });

  it("returns null for ADMIN — a privileged role, never a commercial plan tier", () => {
    expect(getDefaultPlanForRole("ADMIN")).toBeNull();
  });
});

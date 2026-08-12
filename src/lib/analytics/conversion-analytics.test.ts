import { describe, expect, it, vi } from "vitest";

vi.mock("../saas/organization-service", () => ({
  organizationService: { listAll: vi.fn(async () => [{ id: "org-1" }, { id: "org-2" }, { id: "org-3" }, { id: "org-4" }]) },
}));

vi.mock("./subscription-analytics", () => ({
  fetchAllSubscriptions: vi.fn(async () => [
    { organization_id: "org-1", trial_end: "2026-01-01", status: "active" },
    { organization_id: "org-2", trial_end: "2026-01-01", status: "canceled" },
    { organization_id: "org-3", trial_end: null, status: "active" },
  ]),
  getOrganizationPlanMap: vi.fn(async () => new Map([["org-1", "professional"], ["org-3", "professional"]])),
}));

vi.mock("./ai-usage-analytics", () => ({
  getFeatureUsageIndex: vi.fn(async () => ({
    byFeature: new Map([
      ["JD_MATCHING", { organizations: new Set(["org-1", "org-4"]), users: new Set(), requests: 1, credits: 1, lastUsed: null }],
    ]),
  })),
}));

import { getConversionMetrics } from "./conversion-analytics";
import type { DateRange } from "./analytics-types";

const range: DateRange = { preset: "last_30_days", from: new Date("2026-01-01"), to: new Date("2026-01-31") };

describe("getConversionMetrics", () => {
  it("computes the current Free vs Paid organization mix", async () => {
    const conversion = await getConversionMetrics(range);
    // 4 orgs total, 2 paid (org-1, org-3) => 2 free
    expect(conversion.freeToPaid.paidOrganizations).toBe(2);
    expect(conversion.freeToPaid.freeOrganizations).toBe(2);
    expect(conversion.freeToPaid.conversionRate).toEqual({ available: true, value: 0.5 });
  });

  it("computes trial-to-paid as trials that are currently active over all trials", async () => {
    const conversion = await getConversionMetrics(range);
    // trialed: org-1 (active) + org-2 (canceled) = 2; converted: org-1 = 1
    expect(conversion.trialToPaid).toEqual({ available: true, value: 0.5 });
  });

  it("reports insufficient data for plan upgrades — no subscription-history log exists", async () => {
    const conversion = await getConversionMetrics(range);
    expect(conversion.planUpgrades.available).toBe(false);
  });

  it("computes feature-to-paid associated conversion without claiming causality", async () => {
    const conversion = await getConversionMetrics(range);
    const jdMatch = conversion.featureConversion.find((f) => f.feature === "JD Match")!;

    // JD_MATCHING used by org-1 (paid) and org-4 (free) => 1/2
    expect(jdMatch.usedByOrgs).toBe(2);
    expect(jdMatch.usedAndPaidOrgs).toBe(1);
    expect(jdMatch.associatedConversionRate).toEqual({ available: true, value: 0.5 });
    expect(conversion.disclaimer).toMatch(/not a causal claim/);
  });

  it("builds a funnel with real organization counts at each step, sourced honestly", async () => {
    const conversion = await getConversionMetrics(range);
    const registered = conversion.funnel.find((s) => s.step === "Registered Organization")!;
    const subscribed = conversion.funnel.find((s) => s.step === "Subscribed (paid plan)")!;

    expect(registered.count).toBe(4);
    expect(subscribed.count).toBe(2);
  });
});

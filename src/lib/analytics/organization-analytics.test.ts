import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeQueryBuilder } from "./test-helpers";

const tableData: Record<string, unknown> = {};

vi.mock("../supabase/admin", () => ({
  supabaseAdmin: { from: (table: string) => makeQueryBuilder((tableData[table] as Record<string, unknown>[]) ?? []) },
}));

vi.mock("../saas/organization-service", () => ({
  organizationService: {
    listAll: vi.fn(async () => [
      { id: "org-1", name: "Acme", status: "active" },
      { id: "org-2", name: "Beta", status: "active" },
    ]),
  },
}));

vi.mock("../billing/plan-service", () => ({
  listPlans: vi.fn(async () => [
    { id: "plan-free", key: "free", name: "Free", monthly_price_cents: 0, yearly_price_cents: 0, limits: { organization_seats: 2 }, priority_support: false, api_access: false, created_at: "" },
    { id: "plan-pro", key: "professional", name: "Professional", monthly_price_cents: 1900, yearly_price_cents: 19000, limits: { organization_seats: 5 }, priority_support: false, api_access: false, created_at: "" },
  ]),
}));

vi.mock("./subscription-analytics", () => ({
  getOrganizationPlanMap: vi.fn(async () => new Map([["org-1", "professional"]])),
}));

import { getOrganizationMetrics, getOrganizationSelfMetrics } from "./organization-analytics";
import type { DateRange } from "./analytics-types";

const range: DateRange = { preset: "last_30_days", from: new Date("2026-01-01"), to: new Date("2026-01-31") };

// Must match organization-analytics.ts's own currentPeriodStartIso() exactly — credit_balances rows are only matched by an exact period_start equality filter.
function currentPeriodStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

beforeEach(() => {
  for (const key of Object.keys(tableData)) delete tableData[key];
});

describe("getOrganizationMetrics", () => {
  it("flags an organization at or above 90% of its monthly AI credit limit", async () => {
    tableData.credit_balances = [{ organization_id: "org-1", period_start: currentPeriodStartIso(), monthly_limit: 100, reserved: 0, consumed: 92 }];
    tableData.organization_members = [];
    tableData.usage_tracking = [];

    const metrics = await getOrganizationMetrics(range);
    const warning = metrics.organizationsNearLimits.find((w) => w.organizationId === "org-1" && w.limitType === "credits");

    expect(warning).toBeDefined();
    expect(warning?.usagePercent).toBe(92);
  });

  it("flags an organization at or above 90% of its seat limit", async () => {
    tableData.credit_balances = [];
    tableData.organization_members = [{ organization_id: "org-1" }, { organization_id: "org-1" }, { organization_id: "org-1" }, { organization_id: "org-1" }, { organization_id: "org-1" }];
    tableData.usage_tracking = [];

    // org-1 is on Professional (5-seat limit), 5 members = 100% utilization.
    const metrics = await getOrganizationMetrics(range);
    const warning = metrics.organizationsNearLimits.find((w) => w.organizationId === "org-1" && w.limitType === "seats");

    expect(warning).toBeDefined();
    expect(warning?.usagePercent).toBe(100);
  });

  it("does not flag an organization comfortably under its limits", async () => {
    tableData.credit_balances = [{ organization_id: "org-1", period_start: currentPeriodStartIso(), monthly_limit: 100, reserved: 0, consumed: 10 }];
    tableData.organization_members = [{ organization_id: "org-1" }];
    tableData.usage_tracking = [];

    const metrics = await getOrganizationMetrics(range);
    expect(metrics.organizationsNearLimits.find((w) => w.organizationId === "org-1")).toBeUndefined();
  });
});

describe("getOrganizationSelfMetrics (organization isolation)", () => {
  it("returns metrics scoped to exactly the requested organizationId", async () => {
    tableData.credit_balances = [{ organization_id: "org-1", period_start: currentPeriodStartIso(), monthly_limit: 100, reserved: 0, consumed: 40 }];
    tableData.organization_members = [{ organization_id: "org-1" }, { organization_id: "org-1" }];
    tableData.usage_tracking = [{ feature_key: "AI_CHAT", actual_credits: 5, credits_consumed: 5 }];

    const metrics = await getOrganizationSelfMetrics("org-1", range);

    expect(metrics.organizationId).toBe("org-1");
    expect(metrics.planKey).toBe("professional");
    expect(metrics.seats).toBe(2);
    expect(metrics.creditsUsagePercent).toBe(40);
  });

  it("defaults to the free plan for an organization with no active subscription", async () => {
    tableData.credit_balances = [];
    tableData.organization_members = [];
    tableData.usage_tracking = [];

    const metrics = await getOrganizationSelfMetrics("org-2", range);
    expect(metrics.planKey).toBe("free");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeQueryBuilder } from "./test-helpers";

const tableData: Record<string, unknown> = {};

vi.mock("../supabase/admin", () => ({
  supabaseAdmin: { from: (table: string) => makeQueryBuilder((tableData[table] as Record<string, unknown>[]) ?? []) },
}));

vi.mock("../billing/plan-service", () => ({
  listPlans: vi.fn(async () => [
    { id: "plan-free", key: "free", name: "Free", monthly_price_cents: 0, yearly_price_cents: 0, limits: {}, priority_support: false, api_access: false, created_at: "" },
    { id: "plan-pro", key: "professional", name: "Professional", monthly_price_cents: 1900, yearly_price_cents: 19000, limits: {}, priority_support: false, api_access: false, created_at: "" },
  ]),
}));

vi.mock("../saas/organization-service", () => ({
  organizationService: {
    listAll: vi.fn(async () => [{ id: "org-1", name: "Acme" }, { id: "org-2", name: "Beta" }, { id: "org-3", name: "Gamma" }]),
  },
}));

import { getSubscriptionMetrics, getChurnMetrics, getOrganizationPlanMap, highestPlan } from "./subscription-analytics";
import type { DateRange } from "./analytics-types";

const range: DateRange = { preset: "last_30_days", from: new Date("2026-01-01T00:00:00.000Z"), to: new Date("2026-01-31T23:59:59.999Z") };

beforeEach(() => {
  for (const key of Object.keys(tableData)) delete tableData[key];
});

describe("getSubscriptionMetrics", () => {
  it("derives the Free count as organizations minus organizations with a subscriptions row", async () => {
    // 3 organizations total (mocked above), only org-1 has a subscription row => 2 are implicitly Free.
    tableData.subscriptions = [{ organization_id: "org-1", plan_id: "plan-pro", billing_interval: "monthly", status: "active", trial_end: null, grace_period_end: null, created_at: "2026-01-01", updated_at: "2026-01-01" }];

    const metrics = await getSubscriptionMetrics(range);

    expect(metrics.byPlan.free).toBe(2);
    expect(metrics.byPlan.professional).toBe(1);
    expect(metrics.activeSubscriptions).toBe(1);
  });

  it("counts trialing subscriptions", async () => {
    tableData.subscriptions = [{ organization_id: "org-1", plan_id: "plan-pro", billing_interval: "monthly", status: "trialing", trial_end: "2026-02-01", grace_period_end: null, created_at: "", updated_at: "" }];
    const metrics = await getSubscriptionMetrics(range);
    expect(metrics.trials).toBe(1);
  });

  it("counts a canceled subscription toward cancellationsInRange only when updated_at falls inside the range", async () => {
    tableData.subscriptions = [
      { organization_id: "org-1", plan_id: "plan-pro", billing_interval: "monthly", status: "canceled", trial_end: null, grace_period_end: null, created_at: "", updated_at: "2026-01-15T00:00:00.000Z" },
      { organization_id: "org-2", plan_id: "plan-pro", billing_interval: "monthly", status: "canceled", trial_end: null, grace_period_end: null, created_at: "", updated_at: "2025-06-01T00:00:00.000Z" },
    ];

    const metrics = await getSubscriptionMetrics(range);
    expect(metrics.cancellationsInRange).toBe(1);
  });

  it("marks upgrades/downgrades/renewals and plan-conversion sub-metrics as unavailable — no subscription-history log exists", async () => {
    tableData.subscriptions = [];
    const metrics = await getSubscriptionMetrics(range);

    expect(metrics.upgrades.available).toBe(false);
    expect(metrics.downgrades.available).toBe(false);
    expect(metrics.renewals.available).toBe(false);
    expect(metrics.planConversion.freeToPaid.available).toBe(false);
  });
});

describe("getChurnMetrics", () => {
  it("reports insufficient data when there are no subscriptions at all", async () => {
    tableData.subscriptions = [];
    const churn = await getChurnMetrics(range);

    expect(churn.customerChurnRate.available).toBe(false);
    expect(churn.canceledInRange).toBe(0);
  });

  it("computes churn = canceled-in-range / (active + canceled-in-range)", async () => {
    tableData.subscriptions = [
      { organization_id: "org-1", plan_id: "plan-pro", billing_interval: "monthly", status: "active", trial_end: null, grace_period_end: null, created_at: "", updated_at: "2026-01-01" },
      { organization_id: "org-2", plan_id: "plan-pro", billing_interval: "monthly", status: "active", trial_end: null, grace_period_end: null, created_at: "", updated_at: "2026-01-01" },
      { organization_id: "org-3", plan_id: "plan-pro", billing_interval: "monthly", status: "canceled", trial_end: null, grace_period_end: null, created_at: "", updated_at: "2026-01-15T00:00:00.000Z" },
    ];

    const churn = await getChurnMetrics(range);

    expect(churn.canceledInRange).toBe(1);
    expect(churn.customerChurnRate).toEqual({ available: true, value: 1 / 3 });
    // Exactly one subscription per organization in this data model — customer and subscription churn must be identical.
    expect(churn.subscriptionChurnRate).toEqual(churn.customerChurnRate);
  });

  it("computes revenue churn as the canceled MRR over (current MRR + canceled MRR)", async () => {
    tableData.subscriptions = [
      { organization_id: "org-1", plan_id: "plan-pro", billing_interval: "monthly", status: "active", trial_end: null, grace_period_end: null, created_at: "", updated_at: "" },
      { organization_id: "org-2", plan_id: "plan-pro", billing_interval: "monthly", status: "canceled", trial_end: null, grace_period_end: null, created_at: "", updated_at: "2026-01-10T00:00:00.000Z" },
    ];

    const churn = await getChurnMetrics(range);

    // current MRR (org-1 still active) = 1900; canceled MRR (org-2) = 1900. rate = 1900 / (1900+1900) = 0.5
    expect(churn.revenueChurn).toEqual({ available: true, value: 0.5 });
  });
});

describe("getOrganizationPlanMap / highestPlan", () => {
  it("only includes organizations with an active-ish subscription row", async () => {
    tableData.subscriptions = [
      { organization_id: "org-1", plan_id: "plan-pro", billing_interval: "monthly", status: "active", trial_end: null, grace_period_end: null, created_at: "", updated_at: "" },
      { organization_id: "org-2", plan_id: "plan-pro", billing_interval: "monthly", status: "canceled", trial_end: null, grace_period_end: null, created_at: "", updated_at: "" },
    ];

    const map = await getOrganizationPlanMap();
    expect(map.get("org-1")).toBe("professional");
    expect(map.has("org-2")).toBe(false);
  });

  it("highestPlan picks the highest tier among a list", () => {
    expect(highestPlan(["free", "premium", "professional"])).toBe("premium");
    expect(highestPlan([])).toBe("free");
  });
});

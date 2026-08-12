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
  organizationService: { listAll: vi.fn(async () => [{ id: "org-1", name: "Acme", status: "active" }]) },
}));

import { getCurrentMrrArr, getRevenueMetrics } from "./revenue-analytics";
import type { DateRange } from "./analytics-types";

const range: DateRange = { preset: "last_30_days", from: new Date("2026-01-01T00:00:00.000Z"), to: new Date("2026-01-31T23:59:59.999Z") };

beforeEach(() => {
  for (const key of Object.keys(tableData)) delete tableData[key];
});

describe("getCurrentMrrArr", () => {
  it("sums monthly-equivalent price across active-ish subscriptions, converting yearly to /12", async () => {
    tableData.subscriptions = [
      { organization_id: "org-1", plan_id: "plan-pro", billing_interval: "monthly", status: "active" },
      { organization_id: "org-2", plan_id: "plan-pro", billing_interval: "yearly", status: "trialing" },
    ];

    const { mrrCents, arrCents } = await getCurrentMrrArr();

    // monthly: 1900 + yearly: round(19000/12)=1583 => 3483
    expect(mrrCents).toBe(1900 + Math.round(19000 / 12));
    expect(arrCents).toBe(mrrCents * 12);
  });

  it("returns 0 MRR/ARR when there are no active subscriptions", async () => {
    tableData.subscriptions = [];
    const { mrrCents, arrCents } = await getCurrentMrrArr();
    expect(mrrCents).toBe(0);
    expect(arrCents).toBe(0);
  });

  it("excludes canceled subscriptions from MRR", async () => {
    tableData.subscriptions = [{ organization_id: "org-1", plan_id: "plan-pro", billing_interval: "monthly", status: "canceled" }];
    const { mrrCents } = await getCurrentMrrArr();
    expect(mrrCents).toBe(0);
  });
});

describe("getRevenueMetrics", () => {
  it("separates gross revenue, refunds, and failed payments by status", async () => {
    tableData.subscriptions = [];
    tableData.invoices = [];
    tableData.payments = [
      { organization_id: "org-1", amount_cents: 1900, currency: "usd", status: "succeeded", created_at: "2026-01-05T00:00:00.000Z" },
      { organization_id: "org-1", amount_cents: 500, currency: "usd", status: "refunded", created_at: "2026-01-06T00:00:00.000Z" },
      { organization_id: "org-1", amount_cents: 1900, currency: "usd", status: "failed", created_at: "2026-01-07T00:00:00.000Z" },
    ];

    const revenue = await getRevenueMetrics(range);

    expect(revenue.grossRevenueCents).toBe(1900);
    expect(revenue.refundsCents).toBe(500);
    expect(revenue.netRevenueCents).toBe(1900 - 500);
    expect(revenue.failedPaymentsCents).toBe(1900);
    expect(revenue.failedPaymentsCount).toBe(1);
  });

  it("sums tax/discount only from paid invoices", async () => {
    tableData.subscriptions = [];
    tableData.payments = [];
    tableData.invoices = [
      { tax_cents: 100, discount_cents: 50, status: "paid", created_at: "2026-01-05T00:00:00.000Z" },
      { tax_cents: 200, discount_cents: 0, status: "paid", created_at: "2026-01-06T00:00:00.000Z" },
      { tax_cents: 999, discount_cents: 999, status: "open", created_at: "2026-01-06T00:00:00.000Z" },
    ];

    const revenue = await getRevenueMetrics(range);

    expect(revenue.taxesCents).toBe(300);
    expect(revenue.discountsCents).toBe(50);
  });

  it("treats all revenue as recurring — this product has no one-time-purchase feature", async () => {
    tableData.subscriptions = [];
    tableData.invoices = [];
    tableData.payments = [{ organization_id: "org-1", amount_cents: 1900, currency: "usd", status: "succeeded", created_at: "2026-01-05T00:00:00.000Z" }];

    const revenue = await getRevenueMetrics(range);

    expect(revenue.recurringRevenueCents).toBe(revenue.grossRevenueCents);
    expect(revenue.oneTimeRevenueCents).toBe(0);
  });

  it("returns an honest empty result when there is no data at all", async () => {
    tableData.subscriptions = [];
    tableData.payments = [];
    tableData.invoices = [];

    const revenue = await getRevenueMetrics(range);

    expect(revenue.grossRevenueCents).toBe(0);
    expect(revenue.mrrCents).toBe(0);
    expect(revenue.revenueTrend).toEqual([]);
    expect(revenue.revenueByOrganization).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeQueryBuilder } from "./test-helpers";

const tableData: Record<string, unknown> = {};

vi.mock("../supabase/admin", () => ({
  supabaseAdmin: { from: (table: string) => makeQueryBuilder((tableData[table] as Record<string, unknown>[]) ?? []) },
}));

vi.mock("./revenue-analytics", () => ({
  getRevenueMetrics: vi.fn(async () => ({})),
  getCurrentMrrArr: vi.fn(async () => ({ mrrCents: 5000, arrCents: 60000, byPlan: [] })),
}));

vi.mock("./subscription-analytics", () => ({
  getSubscriptionMetrics: vi.fn(async () => ({ activeSubscriptions: 3 })),
  getChurnMetrics: vi.fn(async () => ({ customerChurnRate: { available: true, value: 0.1 } })),
}));

vi.mock("./user-analytics", () => ({
  getUserMetrics: vi.fn(async () => ({ totalUsers: 100, newUsers: 5, paidUsers: 20, activeUsers: { dau: 1, wau: 2, mau: 10 } })),
  getTopUsers: vi.fn(async () => []),
}));

vi.mock("./organization-analytics", () => ({
  getOrganizationMetrics: vi.fn(async () => ({ topOrganizations: [], organizationsNearLimits: [] })),
}));

vi.mock("./ai-usage-analytics", () => ({
  getAIUsageMetrics: vi.fn(async () => ({ totalCredits: 42, estimatedCostCents: 7, dailyTrend: [] })),
}));

vi.mock("./feature-analytics", () => ({
  getFeatureMetrics: vi.fn(async () => ({ features: [] })),
}));

vi.mock("./conversion-analytics", () => ({
  getConversionMetrics: vi.fn(async () => ({})),
}));

import { getOverview, toCsv, parseRangeFromSearchParams } from "./analytics-service";
import { clearAll } from "./analytics-cache";
import type { DateRange } from "./analytics-types";

const range: DateRange = { preset: "last_30_days", from: new Date("2026-01-01"), to: new Date("2026-01-31") };

beforeEach(() => {
  clearAll();
  for (const key of Object.keys(tableData)) delete tableData[key];
});

describe("getOverview", () => {
  it("composes the overview from every underlying metric module", async () => {
    const overview = await getOverview(range);

    expect(overview.totalUsers).toBe(100);
    expect(overview.activeUsers).toBe(10); // MAU
    expect(overview.mrrCents).toBe(5000);
    expect(overview.arrCents).toBe(60000);
    expect(overview.churnRate).toEqual({ available: true, value: 0.1 });
    expect(overview.aiCreditsUsed).toBe(42);
  });
});

describe("toCsv", () => {
  it("returns an empty string for an empty row set", () => {
    expect(toCsv([])).toBe("");
  });

  it("produces a header row followed by one row per record", () => {
    const csv = toCsv([{ a: 1, b: "x" }, { a: 2, b: "y" }]);
    expect(csv).toBe("a,b\n1,x\n2,y");
  });

  it("quotes and escapes fields containing commas or quotes", () => {
    const csv = toCsv([{ name: 'Acme, "The" Corp' }]);
    expect(csv).toBe('name\n"Acme, ""The"" Corp"');
  });

  it("renders null as an empty field", () => {
    const csv = toCsv([{ a: null }]);
    expect(csv).toBe("a\n");
  });
});

describe("parseRangeFromSearchParams", () => {
  it("resolves a valid preset", () => {
    const resolved = parseRangeFromSearchParams(new URLSearchParams("range=this_month"));
    expect(resolved.preset).toBe("this_month");
  });

  it("throws on an invalid preset (route-level 400, not a crash)", () => {
    expect(() => parseRangeFromSearchParams(new URLSearchParams("range=not-a-real-range"))).toThrow();
  });
});

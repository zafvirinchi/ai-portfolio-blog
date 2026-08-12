import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeQueryBuilder } from "./test-helpers";

const tableData: Record<string, unknown> = {};

vi.mock("../supabase/admin", () => ({
  supabaseAdmin: { from: (table: string) => makeQueryBuilder((tableData[table] as Record<string, unknown>[]) ?? []) },
}));

import {
  getAIUsageMetrics,
  getDailyTrendForUser,
  getFeatureUsageForOrganization,
  getFeatureUsageForUser,
  getFeatureUsageIndex,
  getRecentActivityForUser,
  getTopUsersForOrganization,
  getUsageByOrganization,
  getUsageByUser,
} from "./ai-usage-analytics";
import type { DateRange } from "./analytics-types";

const range: DateRange = { preset: "last_30_days", from: new Date("2026-01-01T00:00:00.000Z"), to: new Date("2026-01-31T23:59:59.999Z") };

beforeEach(() => {
  for (const key of Object.keys(tableData)) delete tableData[key];
});

const baseRow = {
  organization_id: "org-1",
  user_id: "user-1",
  operation: "LLM_CALL",
  model: "gpt-4o-mini",
  input_tokens: 100,
  output_tokens: 50,
  duration_ms: 200,
  status: "success",
};

describe("getAIUsageMetrics", () => {
  it("returns an honest empty result for an empty dataset", async () => {
    tableData.usage_tracking = [];
    const metrics = await getAIUsageMetrics(range);

    expect(metrics.totalRequests).toBe(0);
    expect(metrics.totalCredits).toBe(0);
    expect(metrics.byFeature).toEqual([]);
    expect(metrics.byModel).toEqual([]);
    expect(metrics.dailyTrend).toEqual([]);
  });

  it("aggregates totals, tokens, and success/failure counts across rows", async () => {
    tableData.usage_tracking = [
      { ...baseRow, feature_key: "AI_CHAT", actual_credits: 5, credits_consumed: 5, created_at: "2026-01-05T10:00:00.000Z" },
      { ...baseRow, feature_key: "AI_CHAT", actual_credits: 3, credits_consumed: 3, created_at: "2026-01-05T12:00:00.000Z" },
      { ...baseRow, feature_key: "JD_MATCHING", actual_credits: null, credits_consumed: 0, status: "failed", created_at: "2026-01-06T00:00:00.000Z" },
    ];

    const metrics = await getAIUsageMetrics(range);

    expect(metrics.totalRequests).toBe(3);
    expect(metrics.totalCredits).toBe(8);
    expect(metrics.successfulRequests).toBe(2);
    expect(metrics.failedRequests).toBe(1);
    expect(metrics.inputTokens).toBe(300);
    expect(metrics.outputTokens).toBe(150);
  });

  it("groups by feature_key and sorts descending by credits", async () => {
    tableData.usage_tracking = [
      { ...baseRow, feature_key: "AI_CHAT", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-05T00:00:00.000Z" },
      { ...baseRow, feature_key: "RESUME_REWRITE", actual_credits: 10, credits_consumed: 10, created_at: "2026-01-05T00:00:00.000Z" },
    ];

    const metrics = await getAIUsageMetrics(range);

    expect(metrics.byFeature[0].feature).toBe("RESUME_REWRITE");
    expect(metrics.byFeature[0].credits).toBe(10);
    expect(metrics.byFeature[1].feature).toBe("AI_CHAT");
  });

  it("computes per-model failure rate and average duration", async () => {
    tableData.usage_tracking = [
      { ...baseRow, feature_key: "AI_CHAT", model: "gpt-4o-mini", duration_ms: 100, status: "success", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-05T00:00:00.000Z" },
      { ...baseRow, feature_key: "AI_CHAT", model: "gpt-4o-mini", duration_ms: 300, status: "failed", actual_credits: 0, credits_consumed: 0, created_at: "2026-01-05T00:00:00.000Z" },
    ];

    const metrics = await getAIUsageMetrics(range);

    expect(metrics.byModel[0].model).toBe("gpt-4o-mini");
    expect(metrics.byModel[0].requests).toBe(2);
    expect(metrics.byModel[0].averageDurationMs).toBe(200);
    expect(metrics.byModel[0].failureRate).toBe(0.5);
  });

  it("groups daily trend by created_at's calendar day", async () => {
    tableData.usage_tracking = [
      { ...baseRow, feature_key: "AI_CHAT", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-05T01:00:00.000Z" },
      { ...baseRow, feature_key: "AI_CHAT", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-05T20:00:00.000Z" },
      { ...baseRow, feature_key: "AI_CHAT", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-06T00:00:00.000Z" },
    ];

    const metrics = await getAIUsageMetrics(range);

    expect(metrics.dailyTrend).toEqual([
      { date: "2026-01-05", requests: 2, credits: 2 },
      { date: "2026-01-06", requests: 1, credits: 1 },
    ]);
  });
});

describe("getFeatureUsageIndex", () => {
  it("tracks distinct organizations and users per feature", async () => {
    tableData.usage_tracking = [
      { ...baseRow, organization_id: "org-1", user_id: "user-1", feature_key: "AI_CHAT", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-05T00:00:00.000Z" },
      { ...baseRow, organization_id: "org-2", user_id: "user-2", feature_key: "AI_CHAT", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-06T00:00:00.000Z" },
    ];

    const { byFeature } = await getFeatureUsageIndex(range);
    const chat = byFeature.get("AI_CHAT")!;

    expect(chat.organizations.size).toBe(2);
    expect(chat.users.size).toBe(2);
    expect(chat.lastUsed).toBe("2026-01-06T00:00:00.000Z");
  });
});

describe("getUsageByUser", () => {
  it("skips rows with no user_id (anonymous requests)", async () => {
    tableData.usage_tracking = [
      { ...baseRow, user_id: null, feature_key: "AI_CHAT", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-05T00:00:00.000Z" },
      { ...baseRow, user_id: "user-1", feature_key: "AI_CHAT", actual_credits: 2, credits_consumed: 2, created_at: "2026-01-05T00:00:00.000Z" },
    ];

    const byUser = await getUsageByUser(range);
    expect(byUser.size).toBe(1);
    expect(byUser.get("user-1")?.creditsUsed).toBe(2);
  });
});

describe("getUsageByOrganization", () => {
  it("tracks distinct active users per organization", async () => {
    tableData.usage_tracking = [
      { ...baseRow, organization_id: "org-1", user_id: "user-1", feature_key: "AI_CHAT", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-05T00:00:00.000Z" },
      { ...baseRow, organization_id: "org-1", user_id: "user-2", feature_key: "AI_CHAT", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-05T00:00:00.000Z" },
    ];

    const byOrg = await getUsageByOrganization(range);
    expect(byOrg.get("org-1")?.activeUsers.size).toBe(2);
    expect(byOrg.get("org-1")?.credits).toBe(2);
  });
});

describe("getFeatureUsageForOrganization (organization isolation)", () => {
  it("only returns rows for the requested organization, with per-feature active-user and last-used tracking", async () => {
    tableData.usage_tracking = [
      { ...baseRow, organization_id: "org-1", user_id: "user-1", feature_key: "AI_CHAT", actual_credits: 4, credits_consumed: 4, created_at: "2026-01-05T00:00:00.000Z" },
      { ...baseRow, organization_id: "org-2", user_id: "user-2", feature_key: "AI_CHAT", actual_credits: 99, credits_consumed: 99, created_at: "2026-01-06T00:00:00.000Z" },
    ];

    const result = await getFeatureUsageForOrganization("org-1", range);
    expect(result).toEqual([{ feature: "AI_CHAT", requests: 1, credits: 4, activeUsers: 1, lastUsed: "2026-01-05T00:00:00.000Z" }]);
  });
});

describe("getFeatureUsageForUser / getDailyTrendForUser / getRecentActivityForUser (personal scoping)", () => {
  it("getFeatureUsageForUser only includes rows matching both userId and organizationId", async () => {
    tableData.usage_tracking = [
      { feature_key: "AI_CHAT", user_id: "user-1", organization_id: "org-1", actual_credits: 2, credits_consumed: 2, created_at: "2026-01-05T00:00:00.000Z" },
      { feature_key: "AI_CHAT", user_id: "user-2", organization_id: "org-1", actual_credits: 99, credits_consumed: 99, created_at: "2026-01-05T00:00:00.000Z" },
      { feature_key: "AI_CHAT", user_id: "user-1", organization_id: "org-2", actual_credits: 99, credits_consumed: 99, created_at: "2026-01-05T00:00:00.000Z" },
    ];

    const result = await getFeatureUsageForUser("user-1", "org-1", range);
    expect(result).toEqual([{ feature: "AI_CHAT", requests: 1, credits: 2, lastUsed: "2026-01-05T00:00:00.000Z" }]);
  });

  it("getDailyTrendForUser groups only this user's rows in this org by calendar day", async () => {
    tableData.usage_tracking = [
      { feature_key: "AI_CHAT", user_id: "user-1", organization_id: "org-1", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-05T01:00:00.000Z" },
      { feature_key: "AI_CHAT", user_id: "user-1", organization_id: "org-1", actual_credits: 2, credits_consumed: 2, created_at: "2026-01-05T20:00:00.000Z" },
      { feature_key: "AI_CHAT", user_id: "user-2", organization_id: "org-1", actual_credits: 99, credits_consumed: 99, created_at: "2026-01-05T20:00:00.000Z" },
    ];

    const result = await getDailyTrendForUser("user-1", "org-1", range);
    expect(result).toEqual([{ date: "2026-01-05", requests: 2, credits: 3 }]);
  });

  it("getRecentActivityForUser returns only safe columns, most recent first", async () => {
    tableData.usage_tracking = [
      { feature_key: "AI_CHAT", user_id: "user-1", organization_id: "org-1", status: "success", actual_credits: 1, credits_consumed: 1, created_at: "2026-01-05T00:00:00.000Z" },
      { feature_key: "JD_MATCHING", user_id: "user-1", organization_id: "org-1", status: "failed", actual_credits: 0, credits_consumed: 0, created_at: "2026-01-06T00:00:00.000Z" },
    ];

    const result = await getRecentActivityForUser("user-1", "org-1", 10);

    expect(result).toEqual([
      { feature: "JD_MATCHING", createdAt: "2026-01-06T00:00:00.000Z", status: "failed", credits: 0 },
      { feature: "AI_CHAT", createdAt: "2026-01-05T00:00:00.000Z", status: "success", credits: 1 },
    ]);
    // No prompt/response/resume content column exists on usage_tracking to begin with — asserting the shape has exactly these 4 safe fields.
    expect(Object.keys(result[0])).toEqual(["feature", "createdAt", "status", "credits"]);
  });
});

describe("getTopUsersForOrganization (organization isolation)", () => {
  it("never includes another organization's users", async () => {
    tableData.usage_tracking = [
      { feature_key: "AI_CHAT", user_id: "user-1", organization_id: "org-1", actual_credits: 5, credits_consumed: 5, created_at: "2026-01-05T00:00:00.000Z" },
      { feature_key: "AI_CHAT", user_id: "user-2", organization_id: "org-2", actual_credits: 500, credits_consumed: 500, created_at: "2026-01-05T00:00:00.000Z" },
    ];

    const result = await getTopUsersForOrganization("org-1", range);

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("user-1");
  });
});

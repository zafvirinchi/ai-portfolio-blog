import { describe, expect, it, vi } from "vitest";

const mockIndex = { byFeature: new Map<string, { organizations: Set<string>; users: Set<string>; requests: number; credits: number; lastUsed: string | null }>() };

vi.mock("./ai-usage-analytics", () => ({
  getFeatureUsageIndex: vi.fn(async () => mockIndex),
}));

import { getFeatureMetrics } from "./feature-analytics";
import type { DateRange } from "./analytics-types";

const range: DateRange = { preset: "last_30_days", from: new Date("2026-01-01"), to: new Date("2026-01-31") };

describe("getFeatureMetrics", () => {
  it("combines multiple usage_tracking feature_keys into one product feature (Interview Preparation)", async () => {
    mockIndex.byFeature = new Map([
      ["INTERVIEW_GENERATION", { organizations: new Set(["org-1"]), users: new Set(["user-1"]), requests: 2, credits: 4, lastUsed: "2026-01-05" }],
      ["INTERVIEW_EVALUATION", { organizations: new Set(["org-1", "org-2"]), users: new Set(["user-1", "user-2"]), requests: 3, credits: 6, lastUsed: "2026-01-10" }],
    ]);

    const metrics = await getFeatureMetrics(range);
    const row = metrics.features.find((f) => f.feature === "interview_preparation")!;

    expect(row.requests).toBe(5);
    expect(row.credits).toBe(10);
    expect(row.users).toBe(2); // org-1's user-1 counted once, not twice
    expect(row.lastUsed).toBe("2026-01-10");
  });

  it("marks features with no metered call site as tracked:false rather than fabricating zeros as real measurements", async () => {
    mockIndex.byFeature = new Map();
    const metrics = await getFeatureMetrics(range);
    const recruiter = metrics.features.find((f) => f.feature === "recruiter_workspace")!;

    expect(recruiter.tracked).toBe(false);
    expect(recruiter.lastUsed).toBeNull();
  });

  it("sorts features by requests, descending", async () => {
    mockIndex.byFeature = new Map([
      ["AI_CHAT", { organizations: new Set(), users: new Set(), requests: 1, credits: 1, lastUsed: null }],
      ["JD_MATCHING", { organizations: new Set(), users: new Set(), requests: 50, credits: 50, lastUsed: null }],
    ]);

    const metrics = await getFeatureMetrics(range);
    const trackedFeatures = metrics.features.filter((f) => f.tracked);
    expect(trackedFeatures[0].feature).toBe("jd_match");
  });
});

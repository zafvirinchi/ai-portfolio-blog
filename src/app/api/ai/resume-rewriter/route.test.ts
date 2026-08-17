import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 18 Milestone 5 — resume.rewrite is the one gate in this
// milestone that mixes a NONE tier (Free) with a LIMITED/UNLIMITED
// tier (Pro/Premium): requireFeature() must reject a Free-tier caller
// BEFORE requireQuota() (and long before rewriteService.start(), the
// operation this whole check exists to protect) ever runs. See
// src/app/api/ai/job/route.test.ts for the mocking rationale (fake
// error classes shared with entitlement-response.ts via the same
// mocked module).
const requireFeatureMock = vi.fn();
const requireQuotaMock = vi.fn();
const recordUsageMock = vi.fn();
const { FakeQuotaExceededError, FakeFeatureNotEntitledError } = vi.hoisted(() => ({
  FakeQuotaExceededError: class extends Error {
    metric: string;
    limit: number;
    used: number;
    period: string;
    constructor(metric: string, limit: number, used: number, period: string) {
      super(`${period} limit reached for ${metric} (${used}/${limit} used).`);
      this.name = "QuotaExceededError";
      this.metric = metric;
      this.limit = limit;
      this.used = used;
      this.period = period;
    }
  },
  FakeFeatureNotEntitledError: class extends Error {
    featureId: string;
    constructor(featureId: string) {
      super(`"${featureId}" isn't included in your current plan.`);
      this.name = "FeatureNotEntitledError";
      this.featureId = featureId;
    }
  },
}));

vi.mock("@/lib/billing/entitlement-service", () => ({
  requireFeature: (...args: unknown[]) => requireFeatureMock(...args),
  requireQuota: (...args: unknown[]) => requireQuotaMock(...args),
  recordUsage: (...args: unknown[]) => recordUsageMock(...args),
  QuotaExceededError: FakeQuotaExceededError,
  FeatureNotEntitledError: FakeFeatureNotEntitledError,
}));

const getOptionalUserIdMock = vi.fn();
vi.mock("@/lib/billing/persona-service", () => ({
  getOptionalUserId: (...args: unknown[]) => getOptionalUserIdMock(...args),
  PlatformUnauthorizedError: class extends Error {},
}));

const checkCreditsMock = vi.fn();
const consumeCreditsMock = vi.fn();
vi.mock("@/lib/billing/credit-service", () => ({
  checkCredits: (...args: unknown[]) => checkCreditsMock(...args),
  consumeCredits: (...args: unknown[]) => consumeCreditsMock(...args),
}));
vi.mock("@/lib/billing/billing-types", () => ({
  InsufficientCreditsError: class extends Error {},
}));
vi.mock("@/lib/ai/usage/usage-errors", () => ({
  InsufficientAiCreditsError: class extends Error {},
}));

const startMock = vi.fn();
vi.mock("@/lib/ai/resume-rewriter/rewrite-service", () => ({
  rewriteService: { start: (...args: unknown[]) => startMock(...args) },
}));

vi.mock("@/lib/saas/activity-service", () => ({ record: vi.fn() }));

import { POST } from "./route";

function fakeRequest(resumeId = "r1"): Request {
  return new Request("https://example.com/api/ai/resume-rewriter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeId }),
  });
}

beforeEach(() => {
  requireFeatureMock.mockReset();
  requireQuotaMock.mockReset();
  recordUsageMock.mockReset();
  getOptionalUserIdMock.mockReset();
  checkCreditsMock.mockReset().mockResolvedValue(undefined);
  consumeCreditsMock.mockReset();
  startMock.mockReset();
});

describe("POST /api/ai/resume-rewriter — resume.rewrite (NONE/LIMITED/UNLIMITED) enforcement", () => {
  it("never calls rewriteService.start for an anonymous caller — additive, existing anonymous behavior unchanged", async () => {
    getOptionalUserIdMock.mockResolvedValue(null);
    startMock.mockReturnValue({ rewriteId: "rw1" });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(requireFeatureMock).not.toHaveBeenCalled();
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it("a Free-tier signed-in user is rejected by requireFeature() BEFORE requireQuota() or rewriteService.start() ever run", async () => {
    getOptionalUserIdMock.mockResolvedValue("free-user");
    requireFeatureMock.mockRejectedValue(new FakeFeatureNotEntitledError("resume.rewrite"));

    const response = await POST(fakeRequest());

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INCLUDED");
    expect(requireQuotaMock).not.toHaveBeenCalled();
    expect(startMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("a Pro-tier user at their monthly limit is rejected by requireQuota() before rewriteService.start() runs", async () => {
    getOptionalUserIdMock.mockResolvedValue("pro-user");
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockRejectedValue(new FakeQuotaExceededError("AI_REWRITES", 30, 30, "MONTH"));

    const response = await POST(fakeRequest());

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(startMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("records usage exactly once for an allowed, successful rewrite start", async () => {
    getOptionalUserIdMock.mockResolvedValue("premium-user");
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockResolvedValue(undefined);
    startMock.mockReturnValue({ rewriteId: "rw1" });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledWith("premium-user", "AI_REWRITES");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 19 Milestone 6 — genuine defect found and fixed: this route (and
// the whole LinkedIn Optimizer subsystem) previously had NO entitlement/
// quota plumbing at all (Phase 19 M5's own top finding). resume.
// linkedin_optimizer mixes a NONE tier (Free) with LIMITED/UNLIMITED
// (Pro/Premium), same shape as resume.rewrite — see
// resume-rewriter/route.test.ts, the template this file mirrors.
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

const startMock = vi.fn();
vi.mock("@/lib/ai/linkedin/linkedin-service", () => ({
  linkedinService: { start: (...args: unknown[]) => startMock(...args) },
}));

vi.mock("@/lib/saas/activity-service", () => ({ record: vi.fn() }));

import { POST } from "./route";

function fakeRequest(resumeId = "r1"): Request {
  return new Request("https://example.com/api/ai/linkedin", {
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
  startMock.mockReset();
});

describe("POST /api/ai/linkedin — resume.linkedin_optimizer (NONE/LIMITED/UNLIMITED) enforcement", () => {
  it("never calls linkedinService.start for an anonymous caller — additive, existing anonymous behavior unchanged", async () => {
    getOptionalUserIdMock.mockResolvedValue(null);
    startMock.mockReturnValue({ linkedinId: "li1" });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(requireFeatureMock).not.toHaveBeenCalled();
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it("a Free-tier signed-in user is rejected by requireFeature() BEFORE requireQuota() or linkedinService.start() ever run — no LLM call reachable", async () => {
    getOptionalUserIdMock.mockResolvedValue("free-user");
    requireFeatureMock.mockRejectedValue(new FakeFeatureNotEntitledError("resume.linkedin_optimizer"));

    const response = await POST(fakeRequest());

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INCLUDED");
    expect(requireQuotaMock).not.toHaveBeenCalled();
    expect(startMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("a Pro-tier user at their monthly limit is rejected by requireQuota() before linkedinService.start() runs", async () => {
    getOptionalUserIdMock.mockResolvedValue("pro-user");
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockRejectedValue(new FakeQuotaExceededError("LINKEDIN_OPTIMIZATIONS", 30, 30, "MONTH"));

    const response = await POST(fakeRequest());

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(startMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("records usage exactly once for an allowed, successful session start", async () => {
    getOptionalUserIdMock.mockResolvedValue("premium-user");
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockResolvedValue(undefined);
    startMock.mockReturnValue({ linkedinId: "li1" });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledWith("premium-user", "LINKEDIN_OPTIMIZATIONS");
  });

  it("a resumeId validation failure rejects before any entitlement check or LLM call — 400, not 402/422", async () => {
    const response = await POST(fakeRequest(""));

    expect(response.status).toBe(400);
    expect(getOptionalUserIdMock).not.toHaveBeenCalled();
    expect(startMock).not.toHaveBeenCalled();
  });
});

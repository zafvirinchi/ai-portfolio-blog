import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 19 Milestone 6 — genuine defect found and fixed: this route (and
// the whole Cover Letter Generator subsystem) previously had NO
// entitlement/quota plumbing at all (Phase 19 M5's own top finding).
// job.cover_letter has REAL Free-tier access (unlike resume.rewrite/
// resume.linkedin_optimizer's NONE-on-Free), so the Free-tier test below
// proves ALLOWED access, not a rejection — see
// resume-rewriter/route.test.ts for the mocking pattern this mirrors.
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
vi.mock("@/lib/ai/cover-letter/cover-service", () => ({
  coverLetterService: { start: (...args: unknown[]) => startMock(...args) },
}));

vi.mock("@/lib/saas/activity-service", () => ({ record: vi.fn() }));

import { POST } from "./route";

function fakeRequest(overrides: Partial<{ jdMatchId: string; style: string; length: string }> = {}): Request {
  return new Request("https://example.com/api/ai/cover-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jdMatchId: "jd1", style: "Professional", length: "Standard", ...overrides }),
  });
}

beforeEach(() => {
  requireFeatureMock.mockReset();
  requireQuotaMock.mockReset();
  recordUsageMock.mockReset();
  getOptionalUserIdMock.mockReset();
  startMock.mockReset();
});

describe("POST /api/ai/cover-letter — job.cover_letter (LIMITED on every tier) enforcement", () => {
  it("never calls coverLetterService.start for an anonymous caller — additive, existing anonymous behavior unchanged", async () => {
    getOptionalUserIdMock.mockResolvedValue(null);
    startMock.mockResolvedValue({ coverLetterId: "cl1" });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(requireFeatureMock).not.toHaveBeenCalled();
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it("a Free-tier signed-in user under their monthly limit is allowed through to the real generation", async () => {
    getOptionalUserIdMock.mockResolvedValue("free-user");
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockResolvedValue(undefined);
    startMock.mockResolvedValue({ coverLetterId: "cl1" });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledWith("free-user", "COVER_LETTERS");
  });

  it("a Free-tier user at their monthly limit is rejected by requireQuota() before coverLetterService.start() runs — no LLM call reachable", async () => {
    getOptionalUserIdMock.mockResolvedValue("free-user");
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockRejectedValue(new FakeQuotaExceededError("COVER_LETTERS", 3, 3, "MONTH"));

    const response = await POST(fakeRequest());

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(startMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("records usage exactly once for an allowed, successful generation", async () => {
    getOptionalUserIdMock.mockResolvedValue("pro-user");
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockResolvedValue(undefined);
    startMock.mockResolvedValue({ coverLetterId: "cl1" });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledWith("pro-user", "COVER_LETTERS");
  });

  it("a jdMatchId validation failure rejects before any entitlement check or LLM call — 400, not 402/422", async () => {
    const response = await POST(fakeRequest({ jdMatchId: "" }));

    expect(response.status).toBe(400);
    expect(getOptionalUserIdMock).not.toHaveBeenCalled();
    expect(startMock).not.toHaveBeenCalled();
  });
});

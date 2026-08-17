import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 21 Milestone 1 — regression test for a genuine entitlement bypass
// this milestone found and fixed: this route's own header comment claimed
// a jobDescriptionText create was "metered exactly like /api/ai/resume/
// jd-match already is," but it only ran the org-scoped checkCredits("jd_match")
// (a documented no-op for any caller with no Phase-14 organization —
// i.e. every ordinary individual job seeker) and never called the platform
// entitlement system's requireQuota()/recordUsage() for JD_MATCHES, unlike
// every sibling route that runs the same computeJdMatchForResume pipeline
// (/api/ai/resume/jd-match, .../[id]/optimize, .../[id]/jd-optimize/propose
// — the last of which had this exact bug fixed once already, Phase 19 M3).
// Mocking rationale matches that sibling test's own header comment: the
// barrel module is stubbed wholesale since this test only needs to prove
// the quota gate's position relative to the version-creation call.
const requireQuotaMock = vi.fn();
const recordUsageMock = vi.fn();
const { FakeQuotaExceededError } = vi.hoisted(() => ({
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
}));

vi.mock("@/lib/billing/entitlement-service", () => ({
  requireQuota: (...args: unknown[]) => requireQuotaMock(...args),
  recordUsage: (...args: unknown[]) => recordUsageMock(...args),
  QuotaExceededError: FakeQuotaExceededError,
  FeatureNotEntitledError: class extends Error {},
}));

vi.mock("@/lib/billing/persona-service", () => ({
  PlatformUnauthorizedError: class extends Error {},
}));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

// withUsageContext() (real, unmocked below) calls getTenantContext()
// internally, which calls next/headers' cookies() at RUNTIME — mocked
// to a no-op no-organization resolution, same as chat/route.test.ts.
vi.mock("@/lib/saas/tenant-context", () => ({
  getTenantContext: vi.fn(async () => null),
}));

const requireUserIdMock = vi.fn();
const createVersionMock = vi.fn();
const { FakeUnauthorizedError } = vi.hoisted(() => ({
  FakeUnauthorizedError: class extends Error {
    constructor(message = "Unauthorized") {
      super(message);
      this.name = "UnauthorizedError";
    }
  },
}));
vi.mock("@/lib/ai/resume-versions", () => ({
  requireUserId: (...args: unknown[]) => requireUserIdMock(...args),
  createVersionSchema: {
    parse: (body: unknown) => body,
  },
  resumeVersionService: {
    createVersion: (...args: unknown[]) => createVersionMock(...args),
  },
  UnauthorizedError: FakeUnauthorizedError,
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

import { POST } from "./route";

function fakeRequest(jobDescriptionText?: string): Request {
  return new Request("https://example.com/api/ai/resume/versions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jobDescriptionText ? { jobDescriptionText } : {}),
  });
}

beforeEach(() => {
  requireQuotaMock.mockReset();
  recordUsageMock.mockReset();
  requireUserIdMock.mockReset().mockResolvedValue("u1");
  createVersionMock.mockReset();
  checkCreditsMock.mockReset().mockResolvedValue(undefined);
  consumeCreditsMock.mockReset();
});

describe("POST /api/ai/resume/versions — Phase 21 M1 entitlement-bypass fix", () => {
  it("PROVES zero version-creation calls when the user is already at their JD_MATCHES limit", async () => {
    requireQuotaMock.mockRejectedValue(new FakeQuotaExceededError("JD_MATCHES", 5, 5, "MONTH"));

    const response = await POST(fakeRequest("a real job description"));

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(createVersionMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("checks JD_MATCHES quota for the real session user before creating a JD-matched version, and records usage only after success", async () => {
    requireQuotaMock.mockResolvedValue(undefined);
    createVersionMock.mockResolvedValue({ id: "v1" });

    const response = await POST(fakeRequest("a real job description"));

    expect(response.status).toBe(200);
    expect(requireQuotaMock).toHaveBeenCalledWith("u1", "JD_MATCHES");
    expect(createVersionMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledWith("u1", "JD_MATCHES");
  });

  it("does not check JD_MATCHES quota when no jobDescriptionText is supplied (deterministic create)", async () => {
    createVersionMock.mockResolvedValue({ id: "v2" });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(requireQuotaMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
    expect(createVersionMock).toHaveBeenCalledTimes(1);
  });
});

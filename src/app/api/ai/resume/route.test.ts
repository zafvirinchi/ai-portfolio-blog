import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 21 Milestone 2 — regression test for the P0 finding this
// milestone fixed (Phase 21 M1 §13 Finding 3 / §8): this route ran
// several real OpenAI calls per submission (resumeService.analyzeUpload,
// via withUsageContext) for ANY anonymous caller, with zero cost
// control. Fixed with an anonymous-only per-IP daily rate limit
// (anonymous-ai-rate-limiter.ts), scoped to never affect the existing
// per-USER requireQuota("ATS_CHECKS") path (mirrors job/route.test.ts's
// own mocking conventions for the sibling anonymous-capable AI route).
const requireQuotaMock = vi.fn();
const recordUsageMock = vi.fn();
// Phase 23 Milestone 5 — FeatureNotEntitledError/PlatformUnauthorizedError
// are needed here (even though this route only ever throws
// QuotaExceededError itself) because entitlement-response.ts's
// entitlementErrorResponse() — now wired into this route's catch block —
// imports all three from these same two (mocked) modules at load time;
// see resume-rewriter/route.test.ts for the identical convention.
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

const analyzeUploadMock = vi.fn();
vi.mock("@/lib/ai/resume", () => ({
  resumeService: { analyzeUpload: (...args: unknown[]) => analyzeUploadMock(...args) },
}));

// withUsageContext() (real, unmocked) transitively imports
// subscription-service.ts (constructs a real Supabase client via
// supabase/admin.ts at module scope) and tenant-context.ts (calls
// next/headers' cookies() at RUNTIME) — mocked the same way every other
// route test in this repo handles this exact transitive chain (see
// chat/route.test.ts's own header comment).
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/saas/tenant-context", () => ({
  getTenantContext: vi.fn(async () => null),
}));

vi.mock("@/lib/ai/ingestion/document-loader", () => ({
  fromWebFile: vi.fn(async () => ({ filename: "resume.pdf", buffer: Buffer.from("x"), mimeType: "application/pdf" })),
}));

const recordActivityMock = vi.fn();
vi.mock("@/lib/saas/activity-service", () => ({
  record: (...args: unknown[]) => recordActivityMock(...args),
}));

const checkAndRecordAnonymousUsageMock = vi.fn();
vi.mock("@/lib/ai/rate-limiting/anonymous-ai-rate-limiter", () => ({
  checkAndRecordAnonymousUsage: (...args: unknown[]) => checkAndRecordAnonymousUsageMock(...args),
  getClientIp: () => "127.0.0.1",
}));

import { POST } from "./route";

function fakeRequest(): Request {
  const formData = new FormData();
  formData.set("file", new File(["resume text"], "resume.pdf", { type: "application/pdf" }));
  return new Request("https://example.com/api/ai/resume", { method: "POST", body: formData });
}

beforeEach(() => {
  requireQuotaMock.mockReset();
  recordUsageMock.mockReset();
  getOptionalUserIdMock.mockReset().mockResolvedValue(null);
  checkCreditsMock.mockReset().mockResolvedValue(undefined);
  consumeCreditsMock.mockReset();
  analyzeUploadMock.mockReset();
  recordActivityMock.mockReset();
  checkAndRecordAnonymousUsageMock.mockReset().mockResolvedValue({ allowed: true, usedToday: 1, limit: 3 });
});

describe("POST /api/ai/resume — Phase 21 Milestone 2 anonymous rate limit", () => {
  it("allows an anonymous caller under the limit — analyzeUpload still runs, existing behavior unchanged", async () => {
    analyzeUploadMock.mockResolvedValue({ resumeId: "r1", filename: "resume.pdf" });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(checkAndRecordAnonymousUsageMock).toHaveBeenCalledWith("resume_analyze", "127.0.0.1");
    expect(analyzeUploadMock).toHaveBeenCalledTimes(1);
    expect(requireQuotaMock).not.toHaveBeenCalled();
  });

  it("PROVES zero LLM calls when an anonymous caller is over the rate limit", async () => {
    checkAndRecordAnonymousUsageMock.mockResolvedValue({ allowed: false, usedToday: 3, limit: 3, retryAfterSeconds: 7200 });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.retryAfterSeconds).toBe(7200);
    expect(response.headers.get("Retry-After")).toBe("7200");
    expect(analyzeUploadMock).not.toHaveBeenCalled();
    expect(checkCreditsMock).not.toHaveBeenCalled();
  });

  it("does NOT rate-limit an authenticated caller — the anonymous limiter is never even called, entitlement/quota behavior is unchanged", async () => {
    getOptionalUserIdMock.mockResolvedValue("u1");
    requireQuotaMock.mockResolvedValue(undefined);
    analyzeUploadMock.mockResolvedValue({ resumeId: "r1", filename: "resume.pdf" });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(checkAndRecordAnonymousUsageMock).not.toHaveBeenCalled();
    expect(requireQuotaMock).toHaveBeenCalledWith("u1", "ATS_CHECKS");
    expect(recordUsageMock).toHaveBeenCalledWith("u1", "ATS_CHECKS");
  });

  it("PROVES the existing authenticated quota check still runs and still blocks — unaffected by the new anonymous gate", async () => {
    getOptionalUserIdMock.mockResolvedValue("u1");
    requireQuotaMock.mockRejectedValue(new FakeQuotaExceededError("ATS_CHECKS", 5, 5, "MONTH"));

    const response = await POST(fakeRequest());

    expect(response.status).toBe(402);
    expect(analyzeUploadMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("Phase 23 Milestone 5 — the 402 body now carries the structured entitlement shape (code/limit/used/period), so the client's readEntitlementError()/UpgradePrompt can recognize it instead of showing a generic failure string", async () => {
    getOptionalUserIdMock.mockResolvedValue("u1");
    requireQuotaMock.mockRejectedValue(new FakeQuotaExceededError("ATS_CHECKS", 5, 5, "MONTH"));

    const response = await POST(fakeRequest());
    const body = await response.json();

    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(body.limit).toBe(5);
    expect(body.used).toBe(5);
    expect(body.period).toBe("MONTH");
  });
});

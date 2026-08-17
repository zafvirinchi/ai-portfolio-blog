import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 19 Milestone 2, Step 4/5/11 — the first test of /api/ai/chat's
// route handler. This route has an unusually large import surface
// (context wrappers for every ephemeral-tool product family it can be
// embedded in), so this file mocks the two known real-client-
// construction crash points (supabase-server.ts's cookies()-calling
// createSupabaseServerClient, and supabaseAdmin.ts's module-top-level
// createClient()) plus tenant-context.ts/credit-service.ts directly
// (both call cookies()-backed helpers at RUNTIME, not just import
// time) — mirroring every other route test in this repo (see
// src/app/api/ai/job/route.test.ts's own header comment). Every other
// import (the per-product-family AsyncLocalStorage context stores —
// resumeRequestContext, jdMatchRequestContext, etc.) is left real: pure
// AsyncLocalStorage instances with no side effects, confirmed by
// reading their source.
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

vi.mock("@/lib/billing/persona-service", () => ({
  PlatformUnauthorizedError: class extends Error {},
}));

const getUserMock = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser: (...args: unknown[]) => getUserMock(...args) } })),
}));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

// Every *RequestContext module chat/route.ts imports (resume, jd-match,
// interview-prep, mock-interview, resume-rewriter, cover-letter,
// linkedin, recruiter, recruitment) transitively imports this file,
// which constructs a REAL OpenAI client at module top level and throws
// without a real API key — mocked once here rather than mocking each
// of the 9 service modules individually.
vi.mock("@/lib/ai/openai", () => ({ openai: {} }));

vi.mock("@/lib/saas/tenant-context", () => ({
  getTenantContext: vi.fn(async () => null),
  organizationRequestContext: { run: (_ctx: unknown, fn: () => unknown) => fn() },
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

const askMock = vi.fn();
vi.mock("@/lib/ai/services/conversation.service", () => ({
  conversationService: { ask: (...args: unknown[]) => askMock(...args) },
}));

// Phase 21 Milestone 2 — the new anonymous rate-limit gate this route
// now calls before anything else. Defaults to "allowed" in beforeEach so
// every pre-existing test above continues to exercise exactly the
// behavior it already proved, undisturbed; the new describe block below
// overrides this to prove the rejection path.
const checkAndRecordAnonymousUsageMock = vi.fn();
vi.mock("@/lib/ai/rate-limiting/anonymous-ai-rate-limiter", () => ({
  checkAndRecordAnonymousUsage: (...args: unknown[]) => checkAndRecordAnonymousUsageMock(...args),
  getClientIp: () => "127.0.0.1",
}));

import { POST } from "./route";

function fakeRequest(body: Record<string, unknown> = { message: "hello" }): Request {
  return new Request("https://example.com/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireFeatureMock.mockReset();
  requireQuotaMock.mockReset();
  recordUsageMock.mockReset();
  getUserMock.mockReset().mockResolvedValue({ data: { user: null } });
  checkCreditsMock.mockReset().mockResolvedValue(undefined);
  consumeCreditsMock.mockReset();
  askMock.mockReset();
  checkAndRecordAnonymousUsageMock.mockReset().mockResolvedValue({ allowed: true, usedToday: 1, limit: 15 });
});

describe("POST /api/ai/chat — anonymous callers (Step 7: unchanged, additive-only)", () => {
  it("never calls requireFeature/requireQuota for an anonymous caller — the LLM call still runs", async () => {
    askMock.mockResolvedValue({ answer: "hi", tool: "rag-tool", intent: "rag", sources: [] });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(requireFeatureMock).not.toHaveBeenCalled();
    expect(requireQuotaMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
    expect(askMock).toHaveBeenCalledTimes(1);
  });

  it("checks the anonymous rate limit for an anonymous caller", async () => {
    askMock.mockResolvedValue({ answer: "hi", tool: "rag-tool", intent: "rag", sources: [] });

    await POST(fakeRequest());

    expect(checkAndRecordAnonymousUsageMock).toHaveBeenCalledWith("ai_chat", "127.0.0.1");
  });
});

describe("POST /api/ai/chat — Phase 21 Milestone 2 anonymous rate limit", () => {
  it("PROVES zero LLM calls when an anonymous caller is over the rate limit", async () => {
    checkAndRecordAnonymousUsageMock.mockResolvedValue({ allowed: false, usedToday: 15, limit: 15, retryAfterSeconds: 3600 });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.retryAfterSeconds).toBe(3600);
    expect(response.headers.get("Retry-After")).toBe("3600");
    expect(askMock).not.toHaveBeenCalled();
    expect(checkCreditsMock).not.toHaveBeenCalled();
  });

  it("omits Retry-After when it could not be determined", async () => {
    checkAndRecordAnonymousUsageMock.mockResolvedValue({ allowed: false, usedToday: 15, limit: 15 });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeNull();
  });

  it("does NOT rate-limit an authenticated caller — the anonymous limiter is never even called", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u1@example.com" } } });
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockResolvedValue(undefined);
    askMock.mockResolvedValue({ answer: "hi", tool: "rag-tool", intent: "rag", sources: [] });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(checkAndRecordAnonymousUsageMock).not.toHaveBeenCalled();
  });

  it("an authenticated caller is governed only by entitlement/quota, never blocked by the anonymous rate limit even if it would reject", async () => {
    // Proves the two systems can never interact: even if the anonymous
    // limiter mock were somehow invoked and rejecting, an authenticated
    // request must never reach it at all.
    checkAndRecordAnonymousUsageMock.mockResolvedValue({ allowed: false, usedToday: 999, limit: 15 });
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u1@example.com" } } });
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockResolvedValue(undefined);
    askMock.mockResolvedValue({ answer: "hi", tool: "rag-tool", intent: "rag", sources: [] });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(checkAndRecordAnonymousUsageMock).not.toHaveBeenCalled();
  });

  it("rejects a client attempt to forge an authenticated identity via the request body — only the resolved session counts", async () => {
    // No `userId`/`authUser`-shaped field exists in this route's request
    // body at all (message/history/resumeId/... only — see the
    // destructure at the top of POST) — this test proves that even a
    // request body containing a plausible-looking identity field has no
    // effect: authentication is resolved exclusively from the session
    // cookie (getUserMock), so an anonymous session is still rate-limited
    // regardless of what the body claims.
    checkAndRecordAnonymousUsageMock.mockResolvedValue({ allowed: false, usedToday: 15, limit: 15 });

    const response = await POST(
      fakeRequest({ message: "hello", userId: "u1", authUser: { id: "u1" }, recruiterId: "u1" })
    );

    expect(response.status).toBe(429);
    expect(requireFeatureMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai/chat — signed-in callers (Phase 19 Milestone 2)", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u1@example.com" } } });
  });

  it("a Free-tier user is rejected by requireFeature() BEFORE requireQuota() or the LLM call ever run — PROVES zero LLM calls on rejection", async () => {
    requireFeatureMock.mockRejectedValue(new FakeFeatureNotEntitledError("resume.ai_assistant"));

    const response = await POST(fakeRequest());

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INCLUDED");
    expect(requireQuotaMock).not.toHaveBeenCalled();
    expect(askMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("a Pro-tier user at their monthly limit is rejected by requireQuota() — PROVES zero LLM calls once quota is exhausted", async () => {
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockRejectedValue(new FakeQuotaExceededError("AI_CHAT_MESSAGES", 300, 300, "MONTH"));

    const response = await POST(fakeRequest());

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(askMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("records usage EXACTLY ONCE for an allowed request — never once per internal multi-agent call", async () => {
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockResolvedValue(undefined);
    askMock.mockResolvedValue({ answer: "hi", tool: "rag-tool", intent: "rag", sources: [] });

    const response = await POST(fakeRequest());

    expect(response.status).toBe(200);
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledWith("u1", "AI_CHAT_MESSAGES");
  });

  it("does not record usage when the underlying ask() call itself fails after entitlement checks passed", async () => {
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockResolvedValue(undefined);
    askMock.mockRejectedValue(new Error("LLM provider error"));

    const response = await POST(fakeRequest());

    expect(response.status).toBe(500);
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("checks feature and quota before resolving history/context, and in that order", async () => {
    requireFeatureMock.mockResolvedValue(undefined);
    requireQuotaMock.mockResolvedValue(undefined);
    askMock.mockResolvedValue({ answer: "hi", tool: "rag-tool", intent: "rag", sources: [] });

    await POST(fakeRequest());

    expect(requireFeatureMock).toHaveBeenCalledWith("u1", "resume.ai_assistant");
    expect(requireQuotaMock).toHaveBeenCalledWith("u1", "AI_CHAT_MESSAGES");
    const featureOrder = requireFeatureMock.mock.invocationCallOrder[0];
    const quotaOrder = requireQuotaMock.mock.invocationCallOrder[0];
    const askOrder = askMock.mock.invocationCallOrder[0];
    expect(featureOrder).toBeLessThan(quotaOrder);
    expect(quotaOrder).toBeLessThan(askOrder);
  });
});

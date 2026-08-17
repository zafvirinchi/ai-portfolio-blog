import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 19 Milestone 3 — regression test for the genuine bypass this
// milestone found and fixed: this route ran the same 2-LLM-call
// computeJdMatchForResume() pipeline as /api/ai/resume/jd-match (gated
// with JD_MATCHES since Phase 18 M5) but had no platform quota check
// of its own — an authenticated Free-tier user could run unlimited JD
// analyses here despite the ephemeral tool capping them at 5/month.
// Mocking rationale matches every other route test in this repo (see
// src/app/api/ai/job/route.test.ts's header comment) — the barrel
// module is stubbed wholesale since this test only needs to prove the
// quota gate's position relative to the LLM call, not exercise the
// real proposal-building logic (covered elsewhere).
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
const getVersionMock = vi.fn();
const getDynamicDocumentMock = vi.fn();
vi.mock("@/lib/ai/resume-versions", () => ({
  requireUserId: (...args: unknown[]) => requireUserIdMock(...args),
  resumeVersionService: {
    getVersion: (...args: unknown[]) => getVersionMock(...args),
    getDynamicDocument: (...args: unknown[]) => getDynamicDocumentMock(...args),
  },
  gapSkillsFor: () => ({ missing: [], partial: [] }),
  buildChangeProposals: () => [],
  buildEducationAndCertificationProposals: () => [],
  projectAtsScoreAfterProposals: () => 0,
  buildJdOptimizationSummary: () => ({}),
}));

vi.mock("@/lib/ai/resume-versions/resume-version-route-helpers", () => ({
  handleVersionRouteError: (error: unknown, fallback: string) => {
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 401 : 422;
    const message = error instanceof Error ? error.message : fallback;
    return new Response(JSON.stringify({ error: message }), { status, headers: { "Content-Type": "application/json" } });
  },
}));

const computeJdMatchForResumeMock = vi.fn();
vi.mock("@/lib/ai/job-description/jd-service", () => ({
  computeJdMatchForResume: (...args: unknown[]) => computeJdMatchForResumeMock(...args),
}));

vi.mock("@/lib/ai/job-description/keyword-engine", () => ({
  classifyCertificationRequirements: () => [],
  classifyEducationRequirements: () => [],
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

function fakeRequest(): Request {
  return new Request("https://example.com/api/ai/resume/versions/v1/jd-optimize/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobDescriptionText: "a real job description" }),
  });
}

const fakeParams = { params: Promise.resolve({ id: "v1" }) };

beforeEach(() => {
  requireQuotaMock.mockReset();
  recordUsageMock.mockReset();
  requireUserIdMock.mockReset().mockResolvedValue("u1");
  getVersionMock.mockReset().mockResolvedValue({ resumeData: { education: [], certifications: [] }, atsScore: 80 });
  getDynamicDocumentMock.mockReset().mockResolvedValue({});
  checkCreditsMock.mockReset().mockResolvedValue(undefined);
  consumeCreditsMock.mockReset();
  computeJdMatchForResumeMock.mockReset();
});

describe("POST /api/ai/resume/versions/[id]/jd-optimize/propose — Phase 19 M3 bypass fix", () => {
  it("PROVES zero LLM calls when the user is already at their JD_MATCHES limit", async () => {
    requireQuotaMock.mockRejectedValue(new FakeQuotaExceededError("JD_MATCHES", 5, 5, "MONTH"));

    const response = await POST(fakeRequest(), fakeParams);

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(computeJdMatchForResumeMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("checks quota for the real session user, before computeJdMatchForResume() runs", async () => {
    requireQuotaMock.mockResolvedValue(undefined);
    computeJdMatchForResumeMock.mockResolvedValue({
      jobDescription: { educationRequired: [], certifications: [] },
      matchResult: { missingSkills: [], partialSkills: [], optimizedSummary: "", optimizedExperience: [], optimizedProjects: [], optimizedSkills: [], missingKeywordsSection: "", improvementSuggestions: [] },
    });

    const response = await POST(fakeRequest(), fakeParams);

    expect(response.status).toBe(200);
    expect(requireQuotaMock).toHaveBeenCalledWith("u1", "JD_MATCHES");
    expect(computeJdMatchForResumeMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledWith("u1", "JD_MATCHES");
  });
});

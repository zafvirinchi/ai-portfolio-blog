import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 25 Milestone 1 — the new generic "Improve with AI" entry
// point. Mocking rationale matches every sibling resume-versions route
// test (see [id]/jd-optimize/propose/route.test.ts's header comment):
// the barrel module and entitlement service are stubbed wholesale so
// this test can prove (a) ownership is checked before any entitlement
// check or LLM call, (b) the entitlement gate runs before the LLM
// call, (c) usage is recorded only after success, and (d) the real,
// unmocked generateAndValidateVariants()/validateRewrite() fabrication
// guard still falls back to the original text — without needing a
// real OpenAI call or a real Supabase-backed version.
const { FakeResumeVersionNotFoundError, FakeUnauthorizedError, FakeQuotaExceededError } = vi.hoisted(() => ({
  FakeResumeVersionNotFoundError: class extends Error {
    constructor() {
      super("Resume version not found");
      this.name = "ResumeVersionNotFoundError";
    }
  },
  FakeUnauthorizedError: class extends Error {
    constructor() {
      super("Authentication required");
      this.name = "UnauthorizedError";
    }
  },
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

const requireFeatureMock = vi.fn();
const requireQuotaMock = vi.fn();
const recordUsageMock = vi.fn();
vi.mock("@/lib/billing/entitlement-service", () => ({
  requireFeature: (...args: unknown[]) => requireFeatureMock(...args),
  requireQuota: (...args: unknown[]) => requireQuotaMock(...args),
  recordUsage: (...args: unknown[]) => recordUsageMock(...args),
  QuotaExceededError: FakeQuotaExceededError,
  FeatureNotEntitledError: class extends Error {},
}));

vi.mock("@/lib/billing/persona-service", () => ({
  PlatformUnauthorizedError: class extends Error {},
}));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

// rewrite-service.ts (kept REAL below, for its real
// generateAndValidateVariants()/validateRewrite() fabrication guard)
// imports the real OpenAI client at module load time — mocked here so
// importing the route doesn't crash without real env values, per this
// repo's established test pattern.
vi.mock("@/lib/ai/openai", () => ({ openai: { chat: { completions: { create: vi.fn() } }, embeddings: { create: vi.fn() } } }));

const requireUserIdMock = vi.fn();
const getVersionMock = vi.fn();
vi.mock("@/lib/ai/resume-versions", () => ({
  requireUserId: (...args: unknown[]) => requireUserIdMock(...args),
  resumeVersionService: { getVersion: (...args: unknown[]) => getVersionMock(...args) },
  ResumeVersionNotFoundError: FakeResumeVersionNotFoundError,
  UnauthorizedError: FakeUnauthorizedError,
}));

const generateBulletVariantsMock = vi.fn();
vi.mock("@/lib/ai/resume-rewriter/bullet-rewriter", () => ({
  generateBulletVariants: (...args: unknown[]) => generateBulletVariantsMock(...args),
}));

const generateSummaryVariantsMock = vi.fn();
vi.mock("@/lib/ai/resume-rewriter/summary-rewriter", () => ({
  generateSummaryVariants: (...args: unknown[]) => generateSummaryVariantsMock(...args),
}));

const generateSkillsRewriteMock = vi.fn();
vi.mock("@/lib/ai/resume-rewriter/skills-rewriter", () => ({
  generateSkillsRewrite: (...args: unknown[]) => generateSkillsRewriteMock(...args),
}));

import { POST } from "./route";

const fakeResume = {
  contact: { name: "Jane Doe", headline: null, email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
  summary: "Experienced backend engineer.",
  skills: [],
  technicalSkills: [],
  softSkills: [],
  workExperience: [{ title: "Engineer", company: "Acme Corp", location: null, startDate: null, endDate: null, isCurrent: false, description: ["Built X"] }],
  education: [],
  certifications: [],
  projects: [],
  achievements: [],
  languages: [],
  yearsOfExperience: 5,
};

function fakeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.com/api/ai/resume/versions/v1/ai-improve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function textVariant(text: string) {
  return { version: "A", text, explanation: { whyBetter: "", atsImprovements: [], keywordsAdded: [], readabilityImprovement: "", toneImprovement: "" } };
}

const fakeParams = { params: Promise.resolve({ id: "v1" }) };

beforeEach(() => {
  requireFeatureMock.mockReset().mockResolvedValue(undefined);
  requireQuotaMock.mockReset().mockResolvedValue(undefined);
  recordUsageMock.mockReset();
  requireUserIdMock.mockReset().mockResolvedValue("u1");
  getVersionMock.mockReset().mockResolvedValue({ resumeData: fakeResume });
  generateBulletVariantsMock.mockReset();
  generateSummaryVariantsMock.mockReset();
  generateSkillsRewriteMock.mockReset();
});

describe("POST /api/ai/resume/versions/[id]/ai-improve", () => {
  it("returns 404 (not 403) for another user's version, before any entitlement check or LLM call", async () => {
    getVersionMock.mockRejectedValue(new FakeResumeVersionNotFoundError());

    const response = await POST(fakeRequest({ section: "experience", itemText: "Built X" }), fakeParams);

    expect(response.status).toBe(404);
    expect(requireFeatureMock).not.toHaveBeenCalled();
    expect(requireQuotaMock).not.toHaveBeenCalled();
    expect(generateBulletVariantsMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("PROVES zero LLM calls when the user is already at their AI_REWRITES limit", async () => {
    requireQuotaMock.mockRejectedValue(new FakeQuotaExceededError("AI_REWRITES", 5, 5, "MONTH"));

    const response = await POST(fakeRequest({ section: "experience", itemText: "Built X" }), fakeParams);

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(generateBulletVariantsMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("checks feature entitlement for the real session user, before the LLM call", async () => {
    generateBulletVariantsMock.mockResolvedValue([textVariant("Architected and delivered X")]);

    const response = await POST(fakeRequest({ section: "experience", itemText: "Built X" }), fakeParams);

    expect(response.status).toBe(200);
    expect(requireFeatureMock).toHaveBeenCalledWith("u1", "resume.rewrite");
    expect(requireQuotaMock).toHaveBeenCalledWith("u1", "AI_REWRITES");
  });

  it("records usage only after a successful suggestion, never before", async () => {
    generateBulletVariantsMock.mockResolvedValue([textVariant("Architected and delivered X")]);

    const response = await POST(fakeRequest({ section: "experience", itemText: "Built X" }), fakeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.original).toBe("Built X");
    expect(body.suggestions[0].text).toBe("Architected and delivered X");
    expect(recordUsageMock).toHaveBeenCalledWith("u1", "AI_REWRITES");
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the original text when every suggested variant fails the fabrication guard, and never records usage as a failure", async () => {
    // "Google" isn't one of fakeResume's real employers (only "Acme
    // Corp" is) — the real, unmocked validateRewrite() rejects this on
    // both the initial attempt and the one retry generateAndValidateVariants() allows.
    generateBulletVariantsMock.mockResolvedValue([textVariant("Shipped features while working closely with Google's API team")]);

    const response = await POST(fakeRequest({ section: "experience", itemText: "Built X" }), fakeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(generateBulletVariantsMock).toHaveBeenCalledTimes(2); // initial + one corrective retry
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].text).toBe("Built X"); // fell back to the original, unchanged
    expect(recordUsageMock).toHaveBeenCalledWith("u1", "AI_REWRITES"); // still one usage unit — the operation itself succeeded
  });

  it("requires itemText for a non-summary/skills section", async () => {
    const response = await POST(fakeRequest({ section: "experience" }), fakeParams);
    expect(response.status).toBe(400);
    expect(generateBulletVariantsMock).not.toHaveBeenCalled();
  });

  it("dispatches 'summary' to generateSummaryVariants using resumeData.summary, ignoring any itemText", async () => {
    generateSummaryVariantsMock.mockResolvedValue([textVariant("A results-driven backend engineer.")]);

    const response = await POST(fakeRequest({ section: "summary" }), fakeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.original).toBe("Experienced backend engineer.");
    expect(generateSummaryVariantsMock).toHaveBeenCalledWith(fakeResume, "Professional", null, false, undefined);
  });

  it("dispatches 'skills' to generateSkillsRewrite and returns categorized suggestions, not a single text", async () => {
    generateSkillsRewriteMock.mockResolvedValue([{ category: "Backend", skills: ["Node.js", "PostgreSQL"] }]);

    const response = await POST(fakeRequest({ section: "skills" }), fakeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.suggestion.categories).toEqual([{ category: "Backend", skills: ["Node.js", "PostgreSQL"] }]);
    expect(recordUsageMock).toHaveBeenCalledWith("u1", "AI_REWRITES");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 19 Milestone 3 — regression test for the most severe defect
// this milestone found: this route previously called
// pipelineService.passthroughGenerateInterviewReadiness(candidateId),
// which had NO session check at all and resolved "the acting
// recruiter" from the TARGET CANDIDATE'S OWN stored recruiterId — an
// unauthenticated caller who knew/guessed a candidateId could trigger
// a real, HIGH-cost LLM generation billed to a recruiter who never
// authorized it. Fixed to require a real session and call the same
// safely-owned service function its sibling route already uses. These
// tests prove: (1) no session -> 401, zero LLM calls; (2) no
// entitlement -> rejected, zero LLM calls; (3) a real session's own id
// is what's passed to the service, never anything derived from the
// candidateId in the URL.
const { FakeUnauthorizedError, FakeFeatureNotEntitledError } = vi.hoisted(() => ({
  FakeUnauthorizedError: class extends Error {},
  FakeFeatureNotEntitledError: class extends Error {
    featureId: string;
    constructor(featureId: string) {
      super(`"${featureId}" isn't included in your current plan.`);
      this.name = "FeatureNotEntitledError";
      this.featureId = featureId;
    }
  },
}));

const requireRecruiterIdMock = vi.fn();
vi.mock("@/lib/ai/recruiter/recruiter-auth", () => ({
  requireRecruiterId: (...args: unknown[]) => requireRecruiterIdMock(...args),
  UnauthorizedError: FakeUnauthorizedError,
}));

const generateInterviewReadinessMock = vi.fn();
vi.mock("@/lib/ai/recruiter/candidate-service", () => ({
  candidateService: { generateInterviewReadiness: (...args: unknown[]) => generateInterviewReadinessMock(...args) },
}));

const requireFeatureMock = vi.fn();
vi.mock("@/lib/billing/entitlement-service", () => ({
  requireFeature: (...args: unknown[]) => requireFeatureMock(...args),
  QuotaExceededError: class extends Error {},
  FeatureNotEntitledError: FakeFeatureNotEntitledError,
}));

vi.mock("@/lib/billing/persona-service", () => ({
  PlatformUnauthorizedError: class extends Error {},
}));

import { POST } from "./route";

const fakeParams = { params: Promise.resolve({ jobId: "j1", candidateId: "c1" }) };

beforeEach(() => {
  requireRecruiterIdMock.mockReset();
  generateInterviewReadinessMock.mockReset();
  requireFeatureMock.mockReset();
});

describe("POST /api/ai/recruitment/jobs/[jobId]/pipeline/[candidateId]/interview-readiness — Phase 19 M3 critical fix", () => {
  it("PROVES zero LLM calls for an unauthenticated caller — no session means no generation, regardless of candidateId", async () => {
    requireRecruiterIdMock.mockRejectedValue(new FakeUnauthorizedError("You must be signed in to use the Recruiter Workspace."));

    const response = await POST(new Request("https://example.com/x", { method: "POST" }), fakeParams);

    expect(response.status).toBe(401);
    expect(generateInterviewReadinessMock).not.toHaveBeenCalled();
  });

  it("PROVES zero LLM calls when the authenticated recruiter lacks recruiter.interview", async () => {
    requireRecruiterIdMock.mockResolvedValue("real-recruiter");
    requireFeatureMock.mockRejectedValue(new FakeFeatureNotEntitledError("recruiter.interview"));

    const response = await POST(new Request("https://example.com/x", { method: "POST" }), fakeParams);

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INCLUDED");
    expect(generateInterviewReadinessMock).not.toHaveBeenCalled();
  });

  it("passes the REAL session's recruiterId to the service — never a value derived from the candidate/URL", async () => {
    requireRecruiterIdMock.mockResolvedValue("real-recruiter");
    requireFeatureMock.mockResolvedValue(undefined);
    generateInterviewReadinessMock.mockResolvedValue({ candidateId: "c1", interview_readiness_score: 80 });

    const response = await POST(new Request("https://example.com/x", { method: "POST" }), fakeParams);

    expect(response.status).toBe(200);
    expect(generateInterviewReadinessMock).toHaveBeenCalledWith("c1", "real-recruiter");
  });
});

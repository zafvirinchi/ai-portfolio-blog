import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 23 Milestone 5 — regression test for a genuine cost defect: this
// route made a real, uncapped OpenAI call (pipelineService.
// generateHiringRecommendation()) with NO session or entitlement check
// at all, reachable by any unauthenticated caller who knew/guessed a
// jobId/candidateId. Fixed to require a real session + recruiter.
// hiring_report entitlement before any pipeline lookup or LLM call.

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

const getByJobAndCandidateMock = vi.fn();
const generateHiringRecommendationMock = vi.fn();
vi.mock("@/lib/ai/recruitment/pipeline-service", () => ({
  pipelineService: {
    getByJobAndCandidate: (...args: unknown[]) => getByJobAndCandidateMock(...args),
    generateHiringRecommendation: (...args: unknown[]) => generateHiringRecommendationMock(...args),
  },
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
  getByJobAndCandidateMock.mockReset();
  generateHiringRecommendationMock.mockReset();
  requireFeatureMock.mockReset();
});

describe("POST /api/ai/recruitment/jobs/[jobId]/pipeline/[candidateId]/recommendation — Phase 23 M5 cost defect fix", () => {
  it("PROVES zero LLM calls for an unauthenticated caller", async () => {
    requireRecruiterIdMock.mockRejectedValue(new FakeUnauthorizedError("You must be signed in to use the Recruiter Workspace."));

    const response = await POST(new Request("https://example.com/x", { method: "POST" }), fakeParams);

    expect(response.status).toBe(401);
    expect(getByJobAndCandidateMock).not.toHaveBeenCalled();
    expect(generateHiringRecommendationMock).not.toHaveBeenCalled();
  });

  it("PROVES zero LLM calls when the authenticated recruiter lacks recruiter.hiring_report", async () => {
    requireRecruiterIdMock.mockResolvedValue("real-recruiter");
    requireFeatureMock.mockRejectedValue(new FakeFeatureNotEntitledError("recruiter.hiring_report"));

    const response = await POST(new Request("https://example.com/x", { method: "POST" }), fakeParams);

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INCLUDED");
    expect(getByJobAndCandidateMock).not.toHaveBeenCalled();
    expect(generateHiringRecommendationMock).not.toHaveBeenCalled();
  });

  it("succeeds for a real, entitled recruiter session", async () => {
    requireRecruiterIdMock.mockResolvedValue("real-recruiter");
    requireFeatureMock.mockResolvedValue(undefined);
    getByJobAndCandidateMock.mockReturnValue({ pipelineCandidateId: "pc1" });
    generateHiringRecommendationMock.mockResolvedValue({ pipelineCandidateId: "pc1", recommendation: "hire" });

    const response = await POST(new Request("https://example.com/x", { method: "POST" }), fakeParams);

    expect(response.status).toBe(200);
    expect(generateHiringRecommendationMock).toHaveBeenCalledWith("pc1");
  });
});

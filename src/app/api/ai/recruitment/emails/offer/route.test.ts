import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 23 Milestone 5 — regression test for a genuine cost defect: this
// route made a real, uncapped OpenAI call (generateOfferLetterEmail())
// with NO session or entitlement check at all. Fixed to require a real
// session + recruiter.hiring_report entitlement before any lookup or LLM call.

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

const getProfileForSystemUseMock = vi.fn();
vi.mock("@/lib/ai/recruiter/candidate-service", () => ({
  candidateService: { getProfileForSystemUse: (...args: unknown[]) => getProfileForSystemUseMock(...args) },
}));

const pipelineGetMock = vi.fn();
vi.mock("@/lib/ai/recruitment/pipeline-service", () => ({
  pipelineService: { get: (...args: unknown[]) => pipelineGetMock(...args) },
}));

const jobGetMock = vi.fn();
vi.mock("@/lib/ai/recruitment/job-service", () => ({
  jobService: { get: (...args: unknown[]) => jobGetMock(...args) },
}));

const offerGetMock = vi.fn();
vi.mock("@/lib/ai/recruitment/offer-service", () => ({
  offerService: { get: (...args: unknown[]) => offerGetMock(...args) },
}));

const generateOfferLetterEmailMock = vi.fn();
vi.mock("@/lib/ai/recruitment/notification-service", () => ({
  generateOfferLetterEmail: (...args: unknown[]) => generateOfferLetterEmailMock(...args),
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

function req(body: unknown) {
  return new Request("https://example.com/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireRecruiterIdMock.mockReset();
  requireFeatureMock.mockReset();
  getProfileForSystemUseMock.mockReset();
  pipelineGetMock.mockReset();
  jobGetMock.mockReset();
  offerGetMock.mockReset();
  generateOfferLetterEmailMock.mockReset();
});

describe("POST /api/ai/recruitment/emails/offer — Phase 23 M5 cost defect fix", () => {
  it("PROVES zero LLM calls for an unauthenticated caller", async () => {
    requireRecruiterIdMock.mockRejectedValue(new FakeUnauthorizedError("You must be signed in to use the Recruiter Workspace."));

    const response = await POST(req({ pipelineCandidateId: "pc1", offerId: "o1" }));

    expect(response.status).toBe(401);
    expect(generateOfferLetterEmailMock).not.toHaveBeenCalled();
  });

  it("PROVES zero LLM calls when the authenticated recruiter lacks recruiter.hiring_report", async () => {
    requireRecruiterIdMock.mockResolvedValue("real-recruiter");
    requireFeatureMock.mockRejectedValue(new FakeFeatureNotEntitledError("recruiter.hiring_report"));

    const response = await POST(req({ pipelineCandidateId: "pc1", offerId: "o1" }));

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INCLUDED");
    expect(generateOfferLetterEmailMock).not.toHaveBeenCalled();
  });

  it("succeeds for a real, entitled recruiter session", async () => {
    requireRecruiterIdMock.mockResolvedValue("real-recruiter");
    requireFeatureMock.mockResolvedValue(undefined);
    pipelineGetMock.mockReturnValue({ jobId: "j1", candidateId: "c1" });
    jobGetMock.mockReturnValue({ id: "j1", title: "Engineer" });
    offerGetMock.mockReturnValue({ id: "o1" });
    getProfileForSystemUseMock.mockResolvedValue({ resume: {} });
    generateOfferLetterEmailMock.mockResolvedValue({ subject: "Offer", body: "..." });

    const response = await POST(req({ pipelineCandidateId: "pc1", offerId: "o1" }));

    expect(response.status).toBe(200);
    expect(generateOfferLetterEmailMock).toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 23 Milestone 5 — regression test for a genuine cost defect: this
// route made a real, uncapped OpenAI call (interviewScheduler.
// generateInterviewKit()) with NO session or entitlement check at all.
// Fixed to require a real session + recruiter.interview entitlement first.

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

const generateInterviewKitMock = vi.fn();
vi.mock("@/lib/ai/recruitment/interview-scheduler", () => ({
  interviewScheduler: { generateInterviewKit: (...args: unknown[]) => generateInterviewKitMock(...args) },
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

const fakeParams = { params: Promise.resolve({ interviewId: "i1" }) };

beforeEach(() => {
  requireRecruiterIdMock.mockReset();
  generateInterviewKitMock.mockReset();
  requireFeatureMock.mockReset();
});

describe("POST /api/ai/recruitment/interviews/[interviewId]/generate-kit — Phase 23 M5 cost defect fix", () => {
  it("PROVES zero LLM calls for an unauthenticated caller", async () => {
    requireRecruiterIdMock.mockRejectedValue(new FakeUnauthorizedError("You must be signed in to use the Recruiter Workspace."));

    const response = await POST(new Request("https://example.com/x", { method: "POST" }), fakeParams);

    expect(response.status).toBe(401);
    expect(generateInterviewKitMock).not.toHaveBeenCalled();
  });

  it("PROVES zero LLM calls when the authenticated recruiter lacks recruiter.interview", async () => {
    requireRecruiterIdMock.mockResolvedValue("real-recruiter");
    requireFeatureMock.mockRejectedValue(new FakeFeatureNotEntitledError("recruiter.interview"));

    const response = await POST(new Request("https://example.com/x", { method: "POST" }), fakeParams);

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INCLUDED");
    expect(generateInterviewKitMock).not.toHaveBeenCalled();
  });

  it("succeeds for a real, entitled recruiter session", async () => {
    requireRecruiterIdMock.mockResolvedValue("real-recruiter");
    requireFeatureMock.mockResolvedValue(undefined);
    generateInterviewKitMock.mockResolvedValue({ interviewId: "i1", kit: {} });

    const response = await POST(new Request("https://example.com/x", { method: "POST" }), fakeParams);

    expect(response.status).toBe(200);
    expect(generateInterviewKitMock).toHaveBeenCalledWith("i1");
  });
});

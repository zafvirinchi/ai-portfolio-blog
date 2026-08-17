import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 21 Milestone 1 — regression test for the PATCH half of the same
// uncontrolled-cost defect fixed in the sibling jobs/route.ts (POST):
// updating jobDescriptionText re-invokes jdParser.parse() (a real LLM
// call) via recruiterJobService.updateJob(), with no entitlement/persona
// check. Fixed with the same requireFeature(recruiterId, "recruiter.jobs")
// gate, applied only when jobDescriptionText is actually being changed
// (the expensive re-parse path) — an ordinary status-only PATCH is
// unaffected, matching the conditional-gate convention already used by
// /api/ai/resume/versions's own Milestone 1 fix.
const { FakeFeatureNotEntitledError } = vi.hoisted(() => ({
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
  UnauthorizedError: class extends Error {},
}));

const updateJobMock = vi.fn();
const getJobMock = vi.fn();
const deleteJobMock = vi.fn();
vi.mock("@/lib/ai/recruiter/recruiter-job-service", () => ({
  recruiterJobService: {
    updateJob: (...args: unknown[]) => updateJobMock(...args),
    getJob: (...args: unknown[]) => getJobMock(...args),
    deleteJob: (...args: unknown[]) => deleteJobMock(...args),
  },
  RecruiterJobNotFoundError: class extends Error {},
}));

vi.mock("@/lib/ai/recruiter/recruiter-job-types", () => ({
  RECRUITER_JOB_STATUSES: ["Open", "Closed", "Draft"],
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

vi.mock("@/lib/ai/recruiter/candidate-service", () => ({
  CandidateNotFoundError: class extends Error {},
}));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

import { PATCH } from "./route";

function fakeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.com/api/ai/recruiter/jobs/j1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeParams = { params: Promise.resolve({ jobId: "j1" }) };

beforeEach(() => {
  requireRecruiterIdMock.mockReset().mockResolvedValue("recruiter1");
  updateJobMock.mockReset();
  getJobMock.mockReset();
  deleteJobMock.mockReset();
  requireFeatureMock.mockReset();
});

describe("PATCH /api/ai/recruiter/jobs/[jobId] — Phase 21 M1 uncontrolled-cost fix", () => {
  it("does NOT check recruiter.jobs for a status-only update (no re-parse)", async () => {
    updateJobMock.mockResolvedValue({ id: "j1", status: "Closed" });

    const response = await PATCH(fakeRequest({ status: "Closed" }), fakeParams);

    expect(response.status).toBe(200);
    expect(requireFeatureMock).not.toHaveBeenCalled();
    expect(updateJobMock).toHaveBeenCalledTimes(1);
  });

  it("PROVES zero JD re-parse LLM calls for an account with no RECRUITER plan, when jobDescriptionText changes", async () => {
    requireFeatureMock.mockRejectedValue(new FakeFeatureNotEntitledError("recruiter.jobs"));

    const response = await PATCH(fakeRequest({ jobDescriptionText: "an updated job description" }), fakeParams);

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INCLUDED");
    expect(updateJobMock).not.toHaveBeenCalled();
  });

  it("checks recruiter.jobs before re-parsing, for a real recruiter", async () => {
    requireFeatureMock.mockResolvedValue(undefined);
    updateJobMock.mockResolvedValue({ id: "j1" });

    const response = await PATCH(fakeRequest({ jobDescriptionText: "an updated job description" }), fakeParams);

    expect(response.status).toBe(200);
    expect(requireFeatureMock).toHaveBeenCalledWith("recruiter1", "recruiter.jobs");
    expect(updateJobMock).toHaveBeenCalledTimes(1);
  });
});

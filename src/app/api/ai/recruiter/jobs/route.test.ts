import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 21 Milestone 1 — regression test for a genuine uncontrolled-cost
// defect this milestone found and fixed: POST here always runs
// recruiterJobService.createJob(), which parses the pasted JD via
// jdParser.parse() (a real LLM call) — but had NO entitlement/persona
// check at all, only requireRecruiterId() (proves "signed in," not that
// the account holds a RECRUITER plan). Any authenticated platform
// account — including one that was never granted the RECRUITER persona
// — could trigger unlimited real LLM calls here, forever, with zero
// tracking. Fixed with requireFeature(recruiterId, "recruiter.jobs")
// (UNLIMITED on every RECRUITER_* plan, absent from JOB_SEEKER_* plans —
// no new quota/plan/metric introduced).
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

const createJobMock = vi.fn();
const listJobsMock = vi.fn();
vi.mock("@/lib/ai/recruiter/recruiter-job-service", () => ({
  recruiterJobService: {
    createJob: (...args: unknown[]) => createJobMock(...args),
    listJobs: (...args: unknown[]) => listJobsMock(...args),
  },
  RecruiterJobNotFoundError: class extends Error {},
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

import { POST } from "./route";

function fakeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.com/api/ai/recruiter/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireRecruiterIdMock.mockReset().mockResolvedValue("recruiter1");
  createJobMock.mockReset();
  listJobsMock.mockReset();
  requireFeatureMock.mockReset();
});

describe("POST /api/ai/recruiter/jobs — Phase 21 M1 uncontrolled-cost fix", () => {
  it("PROVES zero JD-parse LLM calls for an authenticated account with no RECRUITER plan", async () => {
    requireFeatureMock.mockRejectedValue(new FakeFeatureNotEntitledError("recruiter.jobs"));

    const response = await POST(fakeRequest({ title: "Backend Engineer", jobDescriptionText: "a real job description" }));

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INCLUDED");
    expect(createJobMock).not.toHaveBeenCalled();
  });

  it("checks recruiter.jobs before creating the job, for a real recruiter", async () => {
    requireFeatureMock.mockResolvedValue(undefined);
    createJobMock.mockResolvedValue({ id: "j1" });

    const response = await POST(fakeRequest({ title: "Backend Engineer", jobDescriptionText: "a real job description" }));

    expect(response.status).toBe(200);
    expect(requireFeatureMock).toHaveBeenCalledWith("recruiter1", "recruiter.jobs");
    expect(createJobMock).toHaveBeenCalledTimes(1);
  });
});

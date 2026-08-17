import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 19 Milestone 3 — regression test for the bulk-bypass defect
// this milestone found: the single-candidate status route (Phase 18
// M5) gates "Shortlisted"/"Interview Scheduled" with
// recruiter.shortlist/recruiter.interview, but this bulk equivalent —
// reusing the exact same underlying status semantics — had no such
// check, letting a Free-tier recruiter reach the same restricted
// transitions simply by using bulk-status instead (Step 6's explicit
// "a bulk operation must not partially bypass entitlement" concern).
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

const bulkUpdateStatusMock = vi.fn();
vi.mock("@/lib/ai/recruiter/candidate-service", () => ({
  candidateService: { bulkUpdateStatus: (...args: unknown[]) => bulkUpdateStatusMock(...args) },
  CandidateNotFoundError: class extends Error {},
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

vi.mock("@/lib/ai/recruiter/recruiter-job-service", () => ({
  RecruiterJobNotFoundError: class extends Error {},
}));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

import { POST } from "./route";

function fakeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.com/api/ai/recruiter/candidates/bulk-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireRecruiterIdMock.mockReset().mockResolvedValue("recruiter1");
  bulkUpdateStatusMock.mockReset();
  requireFeatureMock.mockReset();
});

describe("POST /api/ai/recruiter/candidates/bulk-status — Phase 19 M3 bulk-bypass fix", () => {
  it("does NOT check recruiter.shortlist/recruiter.interview for an ordinary status (e.g. Pending Review) — unaffected, matches the single-candidate route", async () => {
    bulkUpdateStatusMock.mockResolvedValue([]);

    const response = await POST(fakeRequest({ candidateIds: ["c1", "c2"], status: "Pending Review" }));

    expect(response.status).toBe(200);
    expect(requireFeatureMock).not.toHaveBeenCalled();
    expect(bulkUpdateStatusMock).toHaveBeenCalledTimes(1);
  });

  it("PROVES a Free-tier recruiter is rejected — and the bulk write never runs — when bulk-transitioning to Shortlisted", async () => {
    requireFeatureMock.mockRejectedValue(new FakeFeatureNotEntitledError("recruiter.shortlist"));

    const response = await POST(fakeRequest({ candidateIds: ["c1", "c2", "c3"], status: "Shortlisted" }));

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("FEATURE_NOT_INCLUDED");
    expect(bulkUpdateStatusMock).not.toHaveBeenCalled();
  });

  it("PROVES a Free-tier recruiter is rejected when bulk-transitioning to Interview Scheduled", async () => {
    requireFeatureMock.mockRejectedValue(new FakeFeatureNotEntitledError("recruiter.interview"));

    const response = await POST(fakeRequest({ candidateIds: ["c1"], status: "Interview Scheduled" }));

    expect(response.status).toBe(402);
    expect(bulkUpdateStatusMock).not.toHaveBeenCalled();
  });

  it("checks the gate exactly once for the whole batch, never once per candidateId", async () => {
    requireFeatureMock.mockResolvedValue(undefined);
    bulkUpdateStatusMock.mockResolvedValue([]);

    await POST(fakeRequest({ candidateIds: ["c1", "c2", "c3", "c4"], status: "Shortlisted" }));

    expect(requireFeatureMock).toHaveBeenCalledTimes(1);
    expect(requireFeatureMock).toHaveBeenCalledWith("recruiter1", "recruiter.shortlist");
  });
});

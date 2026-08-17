import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 18 Milestone 5 — recruiter.candidates is the one gate in this
// milestone with genuinely new inline route logic (a manual
// checkQuota() pre-check rejecting the WHOLE batch upfront, then one
// recordUsage() per candidate ACTUALLY imported — never per file
// submitted, never for duplicates/failures). See job/route.test.ts for
// the mocking rationale.
const checkQuotaMock = vi.fn();
const recordUsageMock = vi.fn();
const { FakeUnauthorizedError, FakeCandidateNotFoundError, FakeRecruiterJobNotFoundError } = vi.hoisted(() => ({
  FakeUnauthorizedError: class extends Error {},
  FakeCandidateNotFoundError: class extends Error {},
  FakeRecruiterJobNotFoundError: class extends Error {},
}));

vi.mock("@/lib/billing/entitlement-service", () => ({
  checkQuota: (...args: unknown[]) => checkQuotaMock(...args),
  recordUsage: (...args: unknown[]) => recordUsageMock(...args),
  QuotaExceededError: class extends Error {},
  FeatureNotEntitledError: class extends Error {},
}));

vi.mock("@/lib/billing/persona-service", () => ({
  PlatformUnauthorizedError: class extends Error {},
}));

const requireRecruiterIdMock = vi.fn();
vi.mock("@/lib/ai/recruiter/recruiter-auth", () => ({
  requireRecruiterId: (...args: unknown[]) => requireRecruiterIdMock(...args),
  UnauthorizedError: FakeUnauthorizedError,
}));

vi.mock("@/lib/ai/recruiter/recruiter-route-helpers", () => ({
  handleRecruiterRouteError: (error: unknown, fallback: string) => {
    if (error instanceof FakeUnauthorizedError) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : fallback }), { status: 422 });
  },
}));

vi.mock("@/lib/ai/recruiter/candidate-service", () => ({
  candidateService: { importResumes: (...args: unknown[]) => importResumesMock(...args) },
  CandidateNotFoundError: FakeCandidateNotFoundError,
}));
const importResumesMock = vi.fn();

vi.mock("@/lib/ai/recruiter/recruiter-job-service", () => ({
  RecruiterJobNotFoundError: FakeRecruiterJobNotFoundError,
}));

vi.mock("@/lib/ai/ingestion/document-loader", () => ({
  fromWebFile: vi.fn(async (file: File) => ({ filename: file.name, buffer: Buffer.from("x"), mimeType: "text/plain" })),
}));

vi.mock("@/lib/saas/activity-service", () => ({ record: vi.fn() }));

import { POST } from "./route";

function fakeRequest(fileCount = 1): Request {
  const formData = new FormData();
  for (let i = 0; i < fileCount; i++) {
    formData.append("files", new File(["resume content"], `resume-${i}.pdf`, { type: "application/pdf" }));
  }
  return new Request("https://example.com/api/ai/recruiter/candidates/import", { method: "POST", body: formData });
}

beforeEach(() => {
  checkQuotaMock.mockReset();
  recordUsageMock.mockReset();
  requireRecruiterIdMock.mockReset().mockResolvedValue("recruiter1");
  importResumesMock.mockReset();
});

describe("POST /api/ai/recruiter/candidates/import — recruiter.candidates quota enforcement", () => {
  it("rejects the WHOLE batch upfront, never calling candidateService.importResumes (the LLM-backed operation), when already at the monthly limit", async () => {
    checkQuotaMock.mockResolvedValue({ metric: "RECRUITER_CANDIDATES", allowed: false, used: 25, limit: 25, period: "MONTH", remaining: 0 });

    const response = await POST(fakeRequest(3));

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(importResumesMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("proceeds and records one usage unit per candidate GENUINELY imported when quota allows", async () => {
    checkQuotaMock.mockResolvedValue({ metric: "RECRUITER_CANDIDATES", allowed: true, used: 2, limit: 25, period: "MONTH", remaining: 23 });
    importResumesMock.mockResolvedValue({
      imported: [{ candidateId: "c1", name: "Alice" }, { candidateId: "c2", name: "Bob" }],
      duplicates: [{ filename: "resume-2.pdf", existingCandidateId: "c0" }],
      failed: [],
    });

    const response = await POST(fakeRequest(3));

    expect(response.status).toBe(200);
    expect(recordUsageMock).toHaveBeenCalledTimes(2);
    expect(recordUsageMock).toHaveBeenNthCalledWith(1, "recruiter1", "RECRUITER_CANDIDATES");
    expect(recordUsageMock).toHaveBeenNthCalledWith(2, "recruiter1", "RECRUITER_CANDIDATES");
  });

  it("never records usage for duplicates or failed files — only for result.imported", async () => {
    checkQuotaMock.mockResolvedValue({ metric: "RECRUITER_CANDIDATES", allowed: true, used: 0, limit: 25, period: "MONTH", remaining: 25 });
    importResumesMock.mockResolvedValue({
      imported: [],
      duplicates: [{ filename: "resume-0.pdf", existingCandidateId: "c0" }],
      failed: [{ filename: "resume-1.pdf", error: "unreadable" }],
    });

    const response = await POST(fakeRequest(2));

    expect(response.status).toBe(200);
    expect(recordUsageMock).not.toHaveBeenCalled();
  });
});

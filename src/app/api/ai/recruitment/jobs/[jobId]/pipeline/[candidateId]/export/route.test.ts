import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 21 Milestone 1 — regression test for a genuine cross-tenant data
// leak this milestone found and fixed: this route previously called
// candidateService.exportCandidateReportPdfForSystemUse(candidateId)
// directly on the URL's candidateId, with NO check that the candidate was
// ever attached to this job's pipeline — unlike every sibling route in
// this same directory (recommendation/route.ts, [candidateId]/route.ts),
// which all require pipelineService.getByJobAndCandidate(jobId,
// candidateId) to resolve first. exportCandidateReportPdfForSystemUse()
// is an explicitly "Internal-only", globally-unscoped helper (no
// recruiter_id filter at all — see its own doc comment in
// candidate-service.ts), and the rendered PDF includes the owning
// recruiter's private candidate notes. Net effect before this fix: any
// caller who knew/guessed a recruiter_candidates.id — regardless of
// which recruiter owned it, and regardless of whether it was ever added
// to ANY legacy pipeline — could download that recruiter's confidential
// notes with zero session and zero pipeline-membership check. These
// tests prove: (1) a candidate not attached to this job's pipeline -> 404,
// zero PDF generation; (2) a genuinely-attached candidate still exports
// successfully, matching the sibling routes' behavior.
const getByJobAndCandidateMock = vi.fn();
vi.mock("@/lib/ai/recruitment/pipeline-service", () => ({
  pipelineService: { getByJobAndCandidate: (...args: unknown[]) => getByJobAndCandidateMock(...args) },
}));

const exportCandidateReportPdfForSystemUseMock = vi.fn();
vi.mock("@/lib/ai/recruiter/candidate-service", () => ({
  candidateService: {
    exportCandidateReportPdfForSystemUse: (...args: unknown[]) => exportCandidateReportPdfForSystemUseMock(...args),
  },
}));

import { GET } from "./route";

const fakeParams = { params: Promise.resolve({ jobId: "j1", candidateId: "c1" }) };

beforeEach(() => {
  getByJobAndCandidateMock.mockReset();
  exportCandidateReportPdfForSystemUseMock.mockReset();
});

describe("GET /api/ai/recruitment/jobs/[jobId]/pipeline/[candidateId]/export — Phase 21 M1 cross-tenant leak fix", () => {
  it("PROVES zero PDF generation for a candidate not attached to this job's pipeline", async () => {
    getByJobAndCandidateMock.mockReturnValue(undefined);

    const response = await GET(new Request("https://example.com/x"), fakeParams);

    expect(response.status).toBe(404);
    expect(exportCandidateReportPdfForSystemUseMock).not.toHaveBeenCalled();
  });

  it("still exports successfully for a candidate genuinely attached to this job's pipeline", async () => {
    getByJobAndCandidateMock.mockReturnValue({ pipelineCandidateId: "pc1" });
    exportCandidateReportPdfForSystemUseMock.mockResolvedValue(Buffer.from("fake-pdf"));

    const response = await GET(new Request("https://example.com/x"), fakeParams);

    expect(response.status).toBe(200);
    expect(getByJobAndCandidateMock).toHaveBeenCalledWith("j1", "c1");
    expect(exportCandidateReportPdfForSystemUseMock).toHaveBeenCalledWith("c1");
  });
});

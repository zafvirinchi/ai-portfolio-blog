import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

// The "Candidate Report" format reuses Milestone 8's own already-public
// PDF renderer directly (read-only) — it's the same underlying
// resume/ATS/insights artifact, not a new pipeline-specific document.
//
// Phase 21 Milestone 1 — this route previously called
// exportCandidateReportPdfForSystemUse() (an explicitly "Internal-only",
// globally-unscoped helper — see its own doc comment in
// candidate-service.ts) directly on the URL's candidateId with no check
// at all, unlike every sibling route in this same directory
// (recommendation/route.ts, [candidateId]/route.ts) which all require
// pipelineService.getByJobAndCandidate(jobId, candidateId) to resolve
// first. That gap let any caller — including one with no session,
// consistent with this legacy subsystem's documented intentionally-
// unauthenticated design — download ANY recruiter's confidential
// candidate report (including their private notes, rendered by
// candidate-export.ts) for ANY recruiter_candidates.id, regardless of
// whether that candidate was ever added to this job's pipeline. This is
// the same minimal fix already applied to this route's own siblings, not
// a change to the subsystem's unauthenticated design.

type Params = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { jobId, candidateId } = await params;

  try {
    const pipelineCandidate = pipelineService.getByJobAndCandidate(jobId, candidateId);

    if (!pipelineCandidate) {
      return NextResponse.json({ error: "This candidate is not attached to this job's pipeline" }, { status: 404 });
    }

    const buffer = await candidateService.exportCandidateReportPdfForSystemUse(candidateId);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="candidate-report-${candidateId}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[recruitment] Candidate report export route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Candidate report export failed" }, { status: 422 });
  }
}

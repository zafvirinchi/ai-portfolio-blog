import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

// The "Candidate Report" format reuses Milestone 8's own already-public
// PDF renderer directly (read-only) — it's the same underlying
// resume/ATS/insights artifact, not a new pipeline-specific document.

type Params = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
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

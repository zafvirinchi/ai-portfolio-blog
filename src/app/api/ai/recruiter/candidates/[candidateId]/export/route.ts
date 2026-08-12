import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { requireRecruiterId, UnauthorizedError } from "@/lib/ai/recruiter/recruiter-auth";
import { CandidateNotFoundError } from "@/lib/ai/recruiter/candidate-service";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    const buffer = await candidateService.exportCandidateReportPdf(candidateId, recruiterId);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="candidate-report-${candidateId}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof CandidateNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("[recruiter] Candidate report export route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Candidate report export failed" }, { status: 422 });
  }
}

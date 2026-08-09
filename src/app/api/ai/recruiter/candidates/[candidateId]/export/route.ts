import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const buffer = await candidateService.exportCandidateReportPdf(candidateId);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="candidate-report-${candidateId}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[recruiter] Candidate report export route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Candidate report export failed" }, { status: 422 });
  }
}

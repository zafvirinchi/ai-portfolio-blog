import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get("format") ?? "csv";

  try {
    if (format === "excel") {
      const buffer = await candidateService.exportCandidateListExcel();

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="candidates.xlsx"`,
        },
      });
    }

    if (format === "pdf") {
      const buffer = await candidateService.exportCandidateListPdf();

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="candidates.pdf"`,
        },
      });
    }

    const csv = candidateService.exportCandidateListCsv();

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="candidates.csv"`,
      },
    });
  } catch (error) {
    console.error("[recruiter] Candidate list export route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Candidate list export failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { jdMatchService } from "@/lib/ai/job-description/jd-service";
import { prepService } from "@/lib/ai/interview-prep/prep-service";
import { resumeService } from "@/lib/ai/resume/resume-service";
import { buildPrepExportSections, renderPrepMarkdown } from "./build-prep-sections";
import { renderPrepDocx } from "./docx-renderer";
import { renderPrepPdf } from "./pdf-renderer";

type Params = {
  params: Promise<{ prepId: string }>;
};

export async function GET(req: Request, { params }: Params) {
  const { prepId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "markdown";

  const record = prepService.get(prepId);

  if (!record) {
    return NextResponse.json({ error: "Interview preparation report not found or expired" }, { status: 404 });
  }

  const jdMatchRecord = jdMatchService.get(record.jdMatchId);
  const resumeRecord = resumeService.get(record.resumeId);

  if (!jdMatchRecord) {
    return NextResponse.json({ error: "JD match result no longer available for this report" }, { status: 404 });
  }

  const candidateName = resumeRecord?.resume.contact.name ?? "Candidate";
  const sections = buildPrepExportSections(record.report, jdMatchRecord.jobDescription, candidateName);

  try {
    if (format === "pdf") {
      const buffer = await renderPrepPdf(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="interview-prep-${prepId}.pdf"`,
        },
      });
    }

    if (format === "docx") {
      const buffer = await renderPrepDocx(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="interview-prep-${prepId}.docx"`,
        },
      });
    }

    const markdown = renderPrepMarkdown(sections);

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="interview-prep-${prepId}.md"`,
      },
    });
  } catch (error) {
    console.error("[interview-prep] Export route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate the interview prep export" },
      { status: 500 }
    );
  }
}

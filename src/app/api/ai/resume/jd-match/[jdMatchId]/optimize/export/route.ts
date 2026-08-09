import { NextResponse } from "next/server";

import { jdMatchService } from "@/lib/ai/job-description/jd-service";
import { resumeOptimizer } from "@/lib/ai/job-description/resume-optimizer";
import { resumeService } from "@/lib/ai/resume/resume-service";
import { buildOptimizerExportSections, renderOptimizerMarkdown } from "./build-optimizer-sections";
import { renderOptimizerDocx } from "./docx-renderer";
import { renderOptimizerPdf } from "./pdf-renderer";

type Params = {
  params: Promise<{ jdMatchId: string }>;
};

export async function GET(req: Request, { params }: Params) {
  const { jdMatchId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "markdown";

  const jdMatchRecord = jdMatchService.get(jdMatchId);

  if (!jdMatchRecord) {
    return NextResponse.json({ error: "JD match result not found or expired" }, { status: 404 });
  }

  const optimizerResult = resumeOptimizer.get(jdMatchId);

  if (!optimizerResult) {
    return NextResponse.json(
      { error: "No optimized resume yet — generate it from the Resume Optimizer tab first." },
      { status: 404 }
    );
  }

  const resumeRecord = resumeService.get(jdMatchRecord.resumeId);
  const candidateName = resumeRecord?.resume.contact.name ?? "Candidate";
  const sections = buildOptimizerExportSections(optimizerResult, jdMatchRecord.jobDescription, candidateName);

  try {
    if (format === "pdf") {
      const buffer = await renderOptimizerPdf(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="optimized-resume-v2-${jdMatchId}.pdf"`,
        },
      });
    }

    if (format === "docx") {
      const buffer = await renderOptimizerDocx(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="optimized-resume-v2-${jdMatchId}.docx"`,
        },
      });
    }

    const markdown = renderOptimizerMarkdown(sections);

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="optimized-resume-v2-${jdMatchId}.md"`,
      },
    });
  } catch (error) {
    console.error("[resume-optimizer] Export route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate the optimized resume export" },
      { status: 500 }
    );
  }
}

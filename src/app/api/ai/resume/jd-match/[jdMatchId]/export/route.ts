import { NextResponse } from "next/server";

import { jdMatchService } from "@/lib/ai/job-description/jd-service";
import { resumeService } from "@/lib/ai/resume/resume-service";
import { buildOptimizedResumeSections, renderOptimizedResumeMarkdown } from "./build-optimized-resume";
import { renderOptimizedResumeDocx } from "./docx-renderer";
import { renderOptimizedResumePdf } from "./pdf-renderer";

type Params = {
  params: Promise<{ jdMatchId: string }>;
};

export async function GET(req: Request, { params }: Params) {
  const { jdMatchId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "markdown";

  const record = jdMatchService.get(jdMatchId);

  if (!record) {
    return NextResponse.json({ error: "JD match result not found or expired" }, { status: 404 });
  }

  const resumeRecord = resumeService.get(record.resumeId);
  const candidateName = resumeRecord?.resume.contact.name ?? "Candidate";
  const sections = buildOptimizedResumeSections(record, candidateName);

  try {
    if (format === "pdf") {
      const buffer = await renderOptimizedResumePdf(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="optimized-resume-${jdMatchId}.pdf"`,
        },
      });
    }

    if (format === "docx") {
      const buffer = await renderOptimizedResumeDocx(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="optimized-resume-${jdMatchId}.docx"`,
        },
      });
    }

    const markdown = renderOptimizedResumeMarkdown(sections);

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="optimized-resume-${jdMatchId}.md"`,
      },
    });
  } catch (error) {
    console.error("[jd] Export route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate the optimized resume export" },
      { status: 500 }
    );
  }
}

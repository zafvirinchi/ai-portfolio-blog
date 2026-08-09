import { NextResponse } from "next/server";

import { coverLetterService } from "@/lib/ai/cover-letter/cover-service";
import {
  buildCoverExportSections,
  renderCoverDocx,
  renderCoverHtml,
  renderCoverMarkdown,
  renderCoverPdf,
  renderCoverPlainText,
} from "@/lib/ai/cover-letter/export-service";
import { resumeService } from "@/lib/ai/resume/resume-service";
import { jdMatchService } from "@/lib/ai/job-description/jd-service";

type Params = {
  params: Promise<{ coverLetterId: string }>;
};

export async function GET(req: Request, { params }: Params) {
  const { coverLetterId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "markdown";

  const record = coverLetterService.get(coverLetterId);

  if (!record) {
    return NextResponse.json({ error: "Cover letter session not found or expired" }, { status: 404 });
  }

  const jdMatchRecord = jdMatchService.get(record.jdMatchId);
  const resumeRecord = jdMatchRecord ? resumeService.get(jdMatchRecord.resumeId) : undefined;

  if (!resumeRecord) {
    return NextResponse.json({ error: "Resume no longer available for this cover letter session" }, { status: 404 });
  }

  const sections = buildCoverExportSections(record, resumeRecord.resume);

  try {
    if (format === "pdf") {
      const buffer = await renderCoverPdf(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="cover-letter-${coverLetterId}.pdf"`,
        },
      });
    }

    if (format === "docx") {
      const buffer = await renderCoverDocx(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="cover-letter-${coverLetterId}.docx"`,
        },
      });
    }

    if (format === "html") {
      return new NextResponse(renderCoverHtml(sections), {
        headers: {
          "Content-Type": "text/html",
          "Content-Disposition": `attachment; filename="cover-letter-${coverLetterId}.html"`,
        },
      });
    }

    if (format === "text") {
      return new NextResponse(renderCoverPlainText(sections), {
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": `attachment; filename="cover-letter-${coverLetterId}.txt"`,
        },
      });
    }

    return new NextResponse(renderCoverMarkdown(sections), {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="cover-letter-${coverLetterId}.md"`,
      },
    });
  } catch (error) {
    console.error("[cover-letter] Export route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate the cover letter export" },
      { status: 500 }
    );
  }
}

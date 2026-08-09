import { NextResponse } from "next/server";

import { resumeService } from "@/lib/ai/resume/resume-service";
import { rewriteService } from "@/lib/ai/resume-rewriter/rewrite-service";
import { buildRewriteExportSections, renderRewriteMarkdown } from "./build-rewrite-sections";
import { renderRewriteDocx } from "./docx-renderer";
import { renderRewriteHtml } from "./html-renderer";
import { renderRewritePdf } from "./pdf-renderer";

type Params = {
  params: Promise<{ rewriteId: string }>;
};

export async function GET(req: Request, { params }: Params) {
  const { rewriteId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "markdown";

  const record = rewriteService.get(rewriteId);

  if (!record) {
    return NextResponse.json({ error: "Resume rewrite session not found or expired" }, { status: 404 });
  }

  const resumeRecord = resumeService.get(record.resumeId);

  if (!resumeRecord) {
    return NextResponse.json({ error: "Resume not found or expired for this rewrite session" }, { status: 404 });
  }

  const sections = buildRewriteExportSections(record, resumeRecord.resume);

  try {
    if (format === "pdf") {
      const buffer = await renderRewritePdf(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="resume-rewrite-${rewriteId}.pdf"`,
        },
      });
    }

    if (format === "docx") {
      const buffer = await renderRewriteDocx(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="resume-rewrite-${rewriteId}.docx"`,
        },
      });
    }

    if (format === "html") {
      const html = renderRewriteHtml(sections);

      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html",
          "Content-Disposition": `attachment; filename="resume-rewrite-${rewriteId}.html"`,
        },
      });
    }

    const markdown = renderRewriteMarkdown(sections);

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="resume-rewrite-${rewriteId}.md"`,
      },
    });
  } catch (error) {
    console.error("[resume-rewriter] Export route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate the resume rewrite export" },
      { status: 500 }
    );
  }
}

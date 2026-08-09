import { NextResponse } from "next/server";

import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";
import {
  buildLinkedinExportSections,
  renderLinkedinDocx,
  renderLinkedinHtml,
  renderLinkedinMarkdown,
  renderLinkedinPdf,
  renderLinkedinPlainText,
  renderLinkedinReadyText,
} from "@/lib/ai/linkedin/export-service";
import { resumeService } from "@/lib/ai/resume/resume-service";

type Params = {
  params: Promise<{ linkedinId: string }>;
};

export async function GET(req: Request, { params }: Params) {
  const { linkedinId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "markdown";

  const record = linkedinService.get(linkedinId);

  if (!record) {
    return NextResponse.json({ error: "LinkedIn optimizer session not found or expired" }, { status: 404 });
  }

  const resumeRecord = resumeService.get(record.resumeId);

  if (!resumeRecord) {
    return NextResponse.json({ error: "Resume no longer available for this LinkedIn optimizer session" }, { status: 404 });
  }

  const sections = buildLinkedinExportSections(record, resumeRecord.resume);

  try {
    if (format === "pdf") {
      const buffer = await renderLinkedinPdf(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="linkedin-profile-${linkedinId}.pdf"`,
        },
      });
    }

    if (format === "docx") {
      const buffer = await renderLinkedinDocx(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="linkedin-profile-${linkedinId}.docx"`,
        },
      });
    }

    if (format === "html") {
      return new NextResponse(renderLinkedinHtml(sections), {
        headers: {
          "Content-Type": "text/html",
          "Content-Disposition": `attachment; filename="linkedin-profile-${linkedinId}.html"`,
        },
      });
    }

    if (format === "text") {
      return new NextResponse(renderLinkedinPlainText(sections), {
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": `attachment; filename="linkedin-profile-${linkedinId}.txt"`,
        },
      });
    }

    if (format === "linkedin") {
      return new NextResponse(renderLinkedinReadyText(sections), {
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": `attachment; filename="linkedin-profile-${linkedinId}-ready.txt"`,
        },
      });
    }

    return new NextResponse(renderLinkedinMarkdown(sections), {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="linkedin-profile-${linkedinId}.md"`,
      },
    });
  } catch (error) {
    console.error("[linkedin] Export route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate the LinkedIn profile export" },
      { status: 500 }
    );
  }
}

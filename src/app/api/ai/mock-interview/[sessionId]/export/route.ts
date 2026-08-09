import { NextResponse } from "next/server";

import { jdMatchService } from "@/lib/ai/job-description/jd-service";
import { sessionService } from "@/lib/ai/mock-interview/session-service";
import { resumeService } from "@/lib/ai/resume/resume-service";
import { buildSessionExportSections, renderSessionMarkdown } from "./build-session-sections";
import { renderSessionDocx } from "./docx-renderer";
import { renderSessionPdf } from "./pdf-renderer";

type Params = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(req: Request, { params }: Params) {
  const { sessionId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "markdown";

  const session = sessionService.get(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Mock interview session not found or expired" }, { status: 404 });
  }

  if (!session.report) {
    return NextResponse.json({ error: "This session hasn't been ended yet — end the interview to generate a report first" }, { status: 409 });
  }

  const resumeRecord = resumeService.get(session.resumeId);
  const jdMatchRecord = jdMatchService.get(session.jdMatchId);

  const candidateName = resumeRecord?.resume.contact.name ?? "Candidate";
  const sections = buildSessionExportSections(
    session,
    jdMatchRecord?.jobDescription.jobTitle ?? null,
    jdMatchRecord?.jobDescription.companyName ?? null,
    candidateName
  );

  try {
    if (format === "pdf") {
      const buffer = await renderSessionPdf(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="mock-interview-${sessionId}.pdf"`,
        },
      });
    }

    if (format === "docx") {
      const buffer = await renderSessionDocx(sections);

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="mock-interview-${sessionId}.docx"`,
        },
      });
    }

    const markdown = renderSessionMarkdown(sections);

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="mock-interview-${sessionId}.md"`,
      },
    });
  } catch (error) {
    console.error("[mock-interview] Export route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate the mock interview export" },
      { status: 500 }
    );
  }
}

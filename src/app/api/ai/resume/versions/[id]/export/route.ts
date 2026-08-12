import { NextResponse } from "next/server";

import { requireUserId, resumeVersionService, ResumeVersionNotFoundError, UnauthorizedError } from "@/lib/ai/resume-versions";
import { renderDynamicResumeMarkdown, renderDynamicResumePdf, renderDynamicResumeDocx, renderDynamicResumeTxt } from "@/lib/ai/resume-versions/dynamic/export";

const LOG_PREFIX = "[resume-version]";

type Params = { params: Promise<{ id: string }> };

// Downloads exactly THIS version's content, through the canonical
// dynamic-document + template-renderer pipeline — the same one the
// Resume Builder's live preview uses (§28/§29's explicit "do not build
// a separate hard-coded PDF/DOCX resume"). getDynamicDocument()
// already handles the lazy fallback for a version that has never been
// opened in the Builder (computed on the fly from resume_data, never
// persisted until an actual edit — see dynamic/resume-migration.ts),
// and getTemplateSettings() does the same for template/theme choices
// (DEFAULT_TEMPLATE_SETTINGS when never set).
//
// Milestone 14 note: prior to this milestone, a version with
// sectionsData === null fell back to a completely separate,
// hard-coded "legacy" renderer (the jd-match export's
// OptimizedResumeSections pipeline) that had no concept of templates
// at all. That branch is retired here — every version, template-aware
// export must go through the dynamic pipeline for template selection
// to actually take effect (a user could otherwise pick a template
// and see it silently ignored simply because they never happened to
// open the Sections editor). toDynamicResumeDocument()'s lazy
// migration (already built and tested in the prior milestone) is
// exactly what makes this safe: it derives an equivalent
// DynamicResumeDocument from any legacy resume_data, so content is
// still fully preserved — the only change is that ALL exports now
// render through one template-aware pipeline instead of two.
export async function GET(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const format = new URL(req.url).searchParams.get("format") ?? "markdown";

    const version = await resumeVersionService.getVersion(userId, id);
    const [document, templateSettings] = await Promise.all([
      resumeVersionService.getDynamicDocument(userId, id),
      resumeVersionService.getTemplateSettings(userId, id),
    ]);

    if (format === "pdf") {
      const buffer = await renderDynamicResumePdf(document, version.versionName, templateSettings);
      return new NextResponse(new Uint8Array(buffer), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${version.versionName}.pdf"` },
      });
    }

    if (format === "docx") {
      const buffer = await renderDynamicResumeDocx(document, version.versionName, templateSettings);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${version.versionName}.docx"`,
        },
      });
    }

    if (format === "txt") {
      const text = renderDynamicResumeTxt(document, version.versionName);
      return new NextResponse(text, {
        headers: { "Content-Type": "text/plain", "Content-Disposition": `attachment; filename="${version.versionName}.txt"` },
      });
    }

    const markdown = renderDynamicResumeMarkdown(document, version.versionName);
    return new NextResponse(markdown, {
      headers: { "Content-Type": "text/markdown", "Content-Disposition": `attachment; filename="${version.versionName}.md"` },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ResumeVersionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error(`${LOG_PREFIX} Export failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to export this version" }, { status: 500 });
  }
}

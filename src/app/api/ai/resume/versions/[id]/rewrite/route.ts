import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { requireUserId, resumeVersionService, ResumeVersionNotFoundError, MasterResumeProtectedError, UnauthorizedError } from "@/lib/ai/resume-versions";
import type { RewrittenSectionsSnapshot } from "@/lib/ai/resume-versions";
import { rewriteService } from "@/lib/ai/resume-rewriter/rewrite-service";
import type { RewriteSection } from "@/lib/ai/resume-rewriter/rewrite-schema";

const LOG_PREFIX = "[resume-version]";

const saveRewriteSchema = z.object({ rewriteId: z.string().min(1) });

// Snapshots an ALREADY-COMPLETED resume-rewriter.ts session's accepted
// content into a version — deterministic, zero new AI calls. Takes a
// rewriteId (not raw section content) so the saved snapshot always
// comes from that existing engine's own accepted state, never
// arbitrary client-supplied JSON.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const { rewriteId } = saveRewriteSchema.parse(await req.json());

    const rewriteRecord = rewriteService.get(rewriteId);

    if (!rewriteRecord) {
      return NextResponse.json({ error: "Rewrite session not found or expired." }, { status: 404 });
    }

    const sections: RewrittenSectionsSnapshot = {};
    for (const [section, state] of Object.entries(rewriteRecord.sections)) {
      if (state) sections[section as RewriteSection] = state.current;
    }

    const version = await resumeVersionService.saveRewrittenSections(userId, id, sections);

    return NextResponse.json({ version });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (error instanceof ResumeVersionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof MasterResumeProtectedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error(`${LOG_PREFIX} Saving rewrite failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save rewritten sections" }, { status: 422 });
  }
}

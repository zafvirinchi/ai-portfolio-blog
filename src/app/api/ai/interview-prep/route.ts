import { NextResponse } from "next/server";

import { prepService } from "@/lib/ai/interview-prep/prep-service";
import { ResumeVersionMissingJdError, resolveInterviewPrepInputFromResumeVersion } from "@/lib/ai/interview-prep/resume-version-adapter";
import { requireUserId, UnauthorizedError } from "@/lib/ai/resume-versions/resume-version-auth";
import { ResumeVersionNotFoundError } from "@/lib/ai/resume-versions/resume-version-service";
import { withUsageContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

// Phase 17 Milestone 2 — extends this existing route (never a second
// interview-prep endpoint) to also accept `resumeVersionId`, resolving
// it to a real {resumeId, jdMatchId} pair via resume-version-adapter.ts
// BEFORE calling the exact same, unmodified prepService.generate() the
// original {resumeId, jdMatchId} path already used. That original
// path's behavior — including remaining unauthenticated, consistent
// with the rest of this ephemeral-tools product family (see
// PHASE17_MILESTONE1's own findings) — is unchanged. Only the new
// resumeVersionId path requires authentication, since resolving a
// Resume Version needs a real, server-derived userId to enforce
// ownership; never trusted from the request body.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { resumeId, jdMatchId, resumeVersionId, jobDescriptionText } = await req.json();

    let resolvedResumeId: string;
    let resolvedJdMatchId: string;

    if (typeof resumeVersionId === "string" && resumeVersionId) {
      const userId = await requireUserId();
      const resolved = await resolveInterviewPrepInputFromResumeVersion(
        userId,
        resumeVersionId,
        typeof jobDescriptionText === "string" ? jobDescriptionText : undefined
      );
      resolvedResumeId = resolved.resumeId;
      resolvedJdMatchId = resolved.jdMatchId;
    } else {
      if (typeof resumeId !== "string" || !resumeId) {
        return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
      }

      if (typeof jdMatchId !== "string" || !jdMatchId) {
        return NextResponse.json({ error: "jdMatchId is required" }, { status: 400 });
      }

      resolvedResumeId = resumeId;
      resolvedJdMatchId = jdMatchId;
    }

    const record = await withUsageContext("INTERVIEW_GENERATION", "INTERVIEW_GENERATION", () =>
      prepService.generate({ resumeId: resolvedResumeId, jdMatchId: resolvedJdMatchId })
    );

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Same 404 (never a distinct 403, never revealing whether another
    // user's version exists) every other resume-version route uses.
    if (error instanceof ResumeVersionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof ResumeVersionMissingJdError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[interview-prep] API route failed", error);

    if (error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Interview preparation failed" },
      { status: 422 }
    );
  }
}

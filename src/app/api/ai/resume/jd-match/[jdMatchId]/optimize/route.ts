import { NextResponse } from "next/server";

import { computeJdMatch } from "@/lib/ai/job-description/jd-matcher";
import { jdMatchService } from "@/lib/ai/job-description/jd-service";
import { ephemeralResumeOptimizer } from "@/lib/ai/job-description/resume-optimizer";
import { resumeService } from "@/lib/ai/resume/resume-service";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";
import { getOptionalUserId } from "@/lib/billing/persona-service";

// One OpenAI structured-output call — same budget as the other JD-match
// routes. Lazily triggered by the UI (only when the Resume Optimizer tab
// is opened), not run automatically during JD-match analysis.
export const maxDuration = 60;

type Params = {
  params: Promise<{ jdMatchId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { jdMatchId } = await params;

  try {
    const jdMatchRecord = jdMatchService.get(jdMatchId);

    if (!jdMatchRecord) {
      return NextResponse.json({ error: "JD match result not found or expired" }, { status: 404 });
    }

    const cached = ephemeralResumeOptimizer.get(jdMatchId);

    if (cached) {
      return NextResponse.json(cached);
    }

    const resumeRecord = resumeService.get(jdMatchRecord.resumeId);

    if (!resumeRecord) {
      return NextResponse.json(
        { error: "Resume not found or expired — please re-upload your resume." },
        { status: 404 }
      );
    }

    // Phase 18 Milestone 5 — additive, no-op for anonymous callers.
    // resume.optimize has no metric (NONE on Free, UNLIMITED on
    // Pro/Premium) — a boolean feature gate, not a quota.
    const platformUserId = await getOptionalUserId();
    if (platformUserId) await requireFeature(platformUserId, "resume.optimize");

    // Deterministic, no-LLM recomputation of the same match data
    // jdMatchService.analyze() already computed once — cheap, and avoids
    // needing to modify jd-service.ts just to retain the intermediate
    // JdMatchComputation object it doesn't otherwise keep.
    const computation = computeJdMatch(resumeRecord.resume, jdMatchRecord.jobDescription);
    const result = await ephemeralResumeOptimizer.optimize(resumeRecord.resume, jdMatchRecord.jobDescription, computation);

    ephemeralResumeOptimizer.store(jdMatchId, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[resume-optimizer] API route failed", error);

    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Resume optimization failed" },
      { status: 422 }
    );
  }
}

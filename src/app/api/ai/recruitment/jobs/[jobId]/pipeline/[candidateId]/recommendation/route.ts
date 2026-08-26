import { NextResponse } from "next/server";

import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";
import { requireRecruiterId, UnauthorizedError } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

export const maxDuration = 60;

type Params = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

// Phase 23 Milestone 5 — genuine cost defect found and fixed, matching
// the pattern already used for this tree's one previously-fixed route
// (interview-readiness, Phase 19 M3): this route made a real, uncapped
// OpenAI call (pipelineService.generateHiringRecommendation()) with NO
// session check and NO entitlement/quota check at all — reachable by any
// unauthenticated caller who knew or guessed a jobId/candidateId.
// Note: unlike interview-readiness, this route's underlying data
// (pipelineService's in-memory store) has no per-recruiter ownership
// concept to verify against — this fix closes the cost/auth exposure
// (a real session + a real RECRUITER entitlement is now required), not a
// data-ownership boundary that doesn't exist in this legacy subsystem's
// data model. Restructuring that store's ownership model is a larger
// change than this route-level fix calls for.
export async function POST(_req: Request, { params }: Params) {
  const { jobId, candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    await requireFeature(recruiterId, "recruiter.hiring_report");

    const pipelineCandidate = pipelineService.getByJobAndCandidate(jobId, candidateId);

    if (!pipelineCandidate) {
      return NextResponse.json({ error: "This candidate is not attached to this job's pipeline" }, { status: 404 });
    }

    const updated = await pipelineService.generateHiringRecommendation(pipelineCandidate.pipelineCandidateId);

    return NextResponse.json(updated);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[recruitment] Hiring recommendation route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Hiring recommendation generation failed" }, { status: 422 });
  }
}

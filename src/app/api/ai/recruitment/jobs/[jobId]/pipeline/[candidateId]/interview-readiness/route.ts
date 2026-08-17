import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { requireRecruiterId, UnauthorizedError } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

export const maxDuration = 60;

type Params = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

// Phase 19 Milestone 3 — genuine defect found and fixed: this route
// previously called pipelineService.passthroughGenerateInterviewReadiness(),
// which had NO session check at all and resolved "the acting recruiter"
// from the TARGET CANDIDATE'S OWN stored recruiterId rather than the
// caller's real identity — meaning any unauthenticated caller who knew
// or guessed a candidateId could trigger a real, HIGH-cost LLM
// generation (candidateService.generateInterviewReadiness() wraps the
// same interview-prep pipeline /api/ai/interview-prep meters) billed
// against a recruiter account that never authorized it, with no
// entitlement check whatsoever. Fixed by calling the exact same
// service function its sibling route
// (/api/ai/recruiter/candidates/[candidateId]/interview-readiness)
// already uses safely: a real session-derived recruiterId (never the
// candidate record's own field), which candidateService's own internal
// requireRecord() ownership check then verifies against — a mismatched
// or nonexistent candidate fails there, never silently defaulting to
// whoever happens to own the id in the URL. The now-unused
// pipelineService.passthroughGenerateInterviewReadiness() was left in
// place (not deleted) — removing library code is a larger change than
// this route-level authorization fix calls for.
export async function POST(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    await requireFeature(recruiterId, "recruiter.interview");

    const record = await candidateService.generateInterviewReadiness(candidateId, recruiterId);
    return NextResponse.json(record);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[recruitment] Interview readiness route failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Interview readiness generation failed" }, { status: 422 });
  }
}

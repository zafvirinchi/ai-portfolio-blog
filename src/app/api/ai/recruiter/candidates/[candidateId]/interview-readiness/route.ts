import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

// Wraps prepService.generate() (interview-prep's full question-generation
// pipeline) — same maxDuration budget as /api/ai/interview-prep itself.
export const maxDuration = 60;

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();

    // Phase 19 Milestone 3 — genuine bypass found and fixed: this route
    // had NO entitlement check at all, despite wrapping the same
    // HIGH-cost interview-prep pipeline /api/ai/interview-prep gates
    // with a real quota (INTERVIEW_PREPARATIONS) on the job-seeker
    // side. Gated with recruiter.interview — the same "Interview
    // Pipeline" feature the sibling interview-link/status-transition
    // routes in this area already require (Phase 18 M5) — rather than
    // inventing a new feature id for one action within that same area.
    // recruiter.interview has no quota metric of its own yet (boolean
    // NONE/UNLIMITED only); whether this specific, genuinely expensive
    // action within it should get its own ceiling — separate from the
    // zero-cost link/status actions sharing the same feature id — is
    // deferred as a documented recommendation (see this milestone's
    // report), not implemented speculatively here.
    await requireFeature(recruiterId, "recruiter.interview");

    const record = await candidateService.generateInterviewReadiness(candidateId, recruiterId);

    return NextResponse.json(record);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Interview readiness generation failed");
  }
}

import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import { recordUsage, requireQuota } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

// Phase 16 Milestone 4, §21 — the explicit "Re-evaluate Candidate"
// recruiter action. Re-runs the JD match against the candidate's own
// currently-attached job only (never a client-supplied jobId) — see
// candidateService.reEvaluateCandidate()'s doc comment for why this
// structurally can't violate the job/candidate/recruiter consistency
// invariant.
export const maxDuration = 60;

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();

    // Phase 19 Milestone 3 — genuine bypass found and fixed: this
    // route internally calls the same matchCandidate() pipeline as
    // /api/ai/recruiter/candidates/[candidateId]/match (2 real LLM
    // calls), which had the exact same missing gate — see that route's
    // own comment. Same fix, same reused metric.
    await requireQuota(recruiterId, "RECRUITER_CANDIDATES");

    const record = await candidateService.reEvaluateCandidate(candidateId, recruiterId);
    await recordUsage(recruiterId, "RECRUITER_CANDIDATES");

    return NextResponse.json(record);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Re-evaluating this candidate failed");
  }
}

import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

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
    const record = await candidateService.reEvaluateCandidate(candidateId, recruiterId);

    return NextResponse.json(record);
  } catch (error) {
    return handleRecruiterRouteError(error, "Re-evaluating this candidate failed");
  }
}

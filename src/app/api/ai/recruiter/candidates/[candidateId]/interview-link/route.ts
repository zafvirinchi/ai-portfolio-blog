import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

// Phase 16 Milestone 8, §10 — resolves the resumeId/jdMatchId params
// for the "Open Interview Preparation" / "Start Mock Interview" deep
// links, always derived server-side from this candidate's own prior
// match (never a client-supplied jobId). No LLM call — this only reads
// candidateService's existing ephemeral-pointer adapter.
type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    const link = await candidateService.getInterviewLinkParams(candidateId, recruiterId);

    return NextResponse.json(link ? { available: true, ...link } : { available: false });
  } catch (error) {
    return handleRecruiterRouteError(error, "Failed to resolve the interview preparation link");
  }
}

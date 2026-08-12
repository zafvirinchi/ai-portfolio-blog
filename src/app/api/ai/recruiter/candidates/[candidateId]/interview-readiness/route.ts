import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

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
    const record = await candidateService.generateInterviewReadiness(candidateId, recruiterId);

    return NextResponse.json(record);
  } catch (error) {
    return handleRecruiterRouteError(error, "Interview readiness generation failed");
  }
}

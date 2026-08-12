import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

export const maxDuration = 60;

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    const { jobId } = await req.json();

    if (typeof jobId !== "string" || !jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const record = await candidateService.matchCandidate(candidateId, recruiterId, jobId);

    return NextResponse.json(record);
  } catch (error) {
    return handleRecruiterRouteError(error, "Matching against the job description failed");
  }
}

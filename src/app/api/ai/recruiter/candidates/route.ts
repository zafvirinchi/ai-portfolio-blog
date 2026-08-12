import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

export async function GET(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    const jobId = new URL(req.url).searchParams.get("jobId") ?? undefined;

    return NextResponse.json(await candidateService.list(recruiterId, { jobId }));
  } catch (error) {
    return handleRecruiterRouteError(error, "Failed to load candidates");
  }
}

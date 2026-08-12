import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

export async function GET() {
  try {
    const recruiterId = await requireRecruiterId();
    return NextResponse.json(await candidateService.computeDashboard(recruiterId));
  } catch (error) {
    return handleRecruiterRouteError(error, "Failed to compute dashboard");
  }
}

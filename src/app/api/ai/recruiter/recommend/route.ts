import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    const body = await req.json().catch(() => ({}));
    const topN = typeof body?.topN === "number" && body.topN > 0 ? body.topN : 5;

    const result = await candidateService.recommendTopCandidates(recruiterId, topN);

    return NextResponse.json(result);
  } catch (error) {
    return handleRecruiterRouteError(error, "Recommendation failed");
  }
}

import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    const { candidateIds } = await req.json();

    if (!Array.isArray(candidateIds) || !candidateIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "candidateIds must be an array of strings" }, { status: 400 });
    }

    const result = await candidateService.compare(recruiterId, candidateIds);

    return NextResponse.json(result);
  } catch (error) {
    return handleRecruiterRouteError(error, "Comparison failed");
  }
}

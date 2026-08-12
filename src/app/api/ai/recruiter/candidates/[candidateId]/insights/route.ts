import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

export const maxDuration = 30;

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    const record = await candidateService.generateInsights(candidateId, recruiterId);

    return NextResponse.json(record);
  } catch (error) {
    return handleRecruiterRouteError(error, "Insights generation failed");
  }
}

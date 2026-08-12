import { NextResponse } from "next/server";

import { CANDIDATE_STATUSES } from "@/lib/ai/recruiter/candidate-schema";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    const { status, note } = await req.json();

    if (!CANDIDATE_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${CANDIDATE_STATUSES.join(", ")}` }, { status: 400 });
    }

    const record = await candidateService.updateStatus(candidateId, recruiterId, status, typeof note === "string" ? note : undefined);

    return NextResponse.json(record);
  } catch (error) {
    return handleRecruiterRouteError(error, "Status update failed");
  }
}

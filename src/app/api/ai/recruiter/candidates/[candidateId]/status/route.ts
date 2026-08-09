import { NextResponse } from "next/server";

import { CANDIDATE_STATUSES } from "@/lib/ai/recruiter/candidate-schema";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const { status } = await req.json();

    if (!CANDIDATE_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${CANDIDATE_STATUSES.join(", ")}` }, { status: 400 });
    }

    const record = candidateService.updateStatus(candidateId, status);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[recruiter] Status update route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Status update failed" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";

import { CandidateTag } from "@/lib/ai/recruiter/candidate-schema";
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
    const { tags } = await req.json();

    if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
      return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
    }

    const record = await candidateService.updateTags(candidateId, recruiterId, tags as CandidateTag[]);

    return NextResponse.json(record);
  } catch (error) {
    return handleRecruiterRouteError(error, "Tags update failed");
  }
}

import { NextResponse } from "next/server";

import { CandidateTag } from "@/lib/ai/recruiter/candidate-schema";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const { tags } = await req.json();

    if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
      return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
    }

    const record = candidateService.updateTags(candidateId, tags as CandidateTag[]);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[recruiter] Tags update route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Tags update failed" }, { status: 422 });
  }
}

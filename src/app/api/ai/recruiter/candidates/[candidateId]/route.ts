import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    const profile = await candidateService.getProfile(candidateId, recruiterId);

    if (!profile) {
      return NextResponse.json({ error: "Candidate not found or their resume has expired" }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    return handleRecruiterRouteError(error, "Failed to load candidate");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    await candidateService.remove(candidateId, recruiterId);

    return NextResponse.json({ removed: true });
  } catch (error) {
    return handleRecruiterRouteError(error, "Failed to remove candidate");
  }
}

import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

export const maxDuration = 60;

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const record = await candidateService.matchCandidateToActiveJd(candidateId);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[recruiter] Candidate match route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Matching against the job description failed" }, { status: 422 });
  }
}

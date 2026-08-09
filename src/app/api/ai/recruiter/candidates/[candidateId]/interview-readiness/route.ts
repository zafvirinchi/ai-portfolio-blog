import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

// Wraps prepService.generate() (interview-prep's full question-generation
// pipeline) — same maxDuration budget as /api/ai/interview-prep itself.
export const maxDuration = 60;

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const record = await candidateService.generateInterviewReadiness(candidateId);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[recruiter] Interview readiness route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Interview readiness generation failed" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";

import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

export const maxDuration = 60;

type Params = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { jobId, candidateId } = await params;

  try {
    const pipelineCandidate = pipelineService.getByJobAndCandidate(jobId, candidateId);

    if (!pipelineCandidate) {
      return NextResponse.json({ error: "This candidate is not attached to this job's pipeline" }, { status: 404 });
    }

    const updated = await pipelineService.generateHiringRecommendation(pipelineCandidate.pipelineCandidateId);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[recruitment] Hiring recommendation route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Hiring recommendation generation failed" }, { status: 422 });
  }
}

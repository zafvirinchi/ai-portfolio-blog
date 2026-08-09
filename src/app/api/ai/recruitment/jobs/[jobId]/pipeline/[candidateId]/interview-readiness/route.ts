import { NextResponse } from "next/server";

import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

export const maxDuration = 60;

type Params = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const record = await pipelineService.passthroughGenerateInterviewReadiness(candidateId);
    return NextResponse.json(record);
  } catch (error) {
    console.error("[recruitment] Interview readiness passthrough route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Interview readiness generation failed" }, { status: 422 });
  }
}

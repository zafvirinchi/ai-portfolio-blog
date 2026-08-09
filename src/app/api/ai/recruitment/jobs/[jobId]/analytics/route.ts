import { NextResponse } from "next/server";

import { computeAnalytics } from "@/lib/ai/recruitment/pipeline-analytics";
import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

type Params = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { jobId } = await params;
  const analytics = computeAnalytics(pipelineService.list(jobId), jobId);

  return NextResponse.json(analytics);
}

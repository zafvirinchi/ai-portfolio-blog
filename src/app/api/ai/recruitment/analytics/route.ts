import { NextResponse } from "next/server";

import { computeAnalytics } from "@/lib/ai/recruitment/pipeline-analytics";
import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

export async function GET() {
  const analytics = computeAnalytics(pipelineService.listAll(), null);
  return NextResponse.json(analytics);
}

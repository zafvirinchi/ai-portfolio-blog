import { NextResponse } from "next/server";

import { JOB_STATUSES } from "@/lib/ai/recruitment/pipeline-schema";
import { jobService } from "@/lib/ai/recruitment/job-service";

type Params = {
  params: Promise<{ jobId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { jobId } = await params;

  try {
    const { status } = await req.json();

    if (!JOB_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${JOB_STATUSES.join(", ")}` }, { status: 400 });
    }

    const job = jobService.setStatus(jobId, status);

    return NextResponse.json(job);
  } catch (error) {
    console.error("[recruitment] Job status route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Job status update failed" }, { status: 422 });
  }
}

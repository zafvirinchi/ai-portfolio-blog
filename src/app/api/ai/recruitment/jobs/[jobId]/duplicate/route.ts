import { NextResponse } from "next/server";

import { jobService } from "@/lib/ai/recruitment/job-service";

type Params = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { jobId } = await params;

  try {
    const job = jobService.duplicate(jobId);
    return NextResponse.json(job);
  } catch (error) {
    console.error("[recruitment] Job duplicate route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Job duplication failed" }, { status: 422 });
  }
}

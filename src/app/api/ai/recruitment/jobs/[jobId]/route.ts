import { NextResponse } from "next/server";

import { jobService } from "@/lib/ai/recruitment/job-service";

type Params = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { jobId } = await params;
  const job = jobService.get(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function PATCH(req: Request, { params }: Params) {
  const { jobId } = await params;

  try {
    const body = await req.json();
    const job = jobService.update(jobId, body);

    return NextResponse.json(job);
  } catch (error) {
    console.error("[recruitment] Job update route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Job update failed" }, { status: 422 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { jobId } = await params;
  jobService.delete(jobId);

  return NextResponse.json({ removed: true });
}

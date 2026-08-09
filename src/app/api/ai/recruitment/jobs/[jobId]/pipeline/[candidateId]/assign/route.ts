import { NextResponse } from "next/server";

import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

type Params = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { jobId, candidateId } = await params;

  try {
    const { assignedRecruiter, hiringManager } = await req.json();

    const pipelineCandidate = pipelineService.getByJobAndCandidate(jobId, candidateId);

    if (!pipelineCandidate) {
      return NextResponse.json({ error: "This candidate is not attached to this job's pipeline" }, { status: 404 });
    }

    const updated = pipelineService.assign(pipelineCandidate.pipelineCandidateId, {
      assignedRecruiter: assignedRecruiter === undefined ? undefined : typeof assignedRecruiter === "string" ? assignedRecruiter : null,
      hiringManager: hiringManager === undefined ? undefined : typeof hiringManager === "string" ? hiringManager : null,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[recruitment] Assign route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Assignment failed" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";

import { ACTING_ROLES, CANDIDATE_STAGES } from "@/lib/ai/recruitment/pipeline-schema";
import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

type Params = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { jobId, candidateId } = await params;

  try {
    const { stage, actingRole } = await req.json();

    if (!CANDIDATE_STAGES.includes(stage)) {
      return NextResponse.json({ error: `stage must be one of: ${CANDIDATE_STAGES.join(", ")}` }, { status: 400 });
    }

    const pipelineCandidate = pipelineService.getByJobAndCandidate(jobId, candidateId);

    if (!pipelineCandidate) {
      return NextResponse.json({ error: "This candidate is not attached to this job's pipeline" }, { status: 404 });
    }

    const resolvedRole = ACTING_ROLES.includes(actingRole) ? actingRole : null;
    const updated = pipelineService.changeStage(pipelineCandidate.pipelineCandidateId, stage, resolvedRole);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[recruitment] Stage change route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Stage change failed" }, { status: 422 });
  }
}

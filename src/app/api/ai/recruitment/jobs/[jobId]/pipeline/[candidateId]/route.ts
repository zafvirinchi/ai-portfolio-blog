import { NextResponse } from "next/server";

import { jdMatchService } from "@/lib/ai/job-description/jd-service";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

type Params = {
  params: Promise<{ jobId: string; candidateId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { jobId, candidateId } = await params;
  const pipelineCandidate = pipelineService.getByJobAndCandidate(jobId, candidateId);

  if (!pipelineCandidate) {
    return NextResponse.json({ error: "This candidate is not attached to this job's pipeline" }, { status: 404 });
  }

  const profile = await candidateService.getProfileForSystemUse(candidateId);

  if (!profile) {
    return NextResponse.json({ error: "Candidate not found or their resume has expired" }, { status: 404 });
  }

  const jdMatchRecord = pipelineCandidate.jdMatchId ? jdMatchService.get(pipelineCandidate.jdMatchId) : undefined;

  return NextResponse.json({
    pipelineCandidate,
    summary: profile.summary,
    resume: profile.resume,
    jdMatchResult: jdMatchRecord?.matchResult ?? null,
  });
}

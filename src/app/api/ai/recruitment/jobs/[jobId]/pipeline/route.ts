import { NextResponse } from "next/server";

import { jdMatchService } from "@/lib/ai/job-description/jd-service";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

export const maxDuration = 60;

type Params = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { jobId } = await params;
  const pipelineCandidates = pipelineService.list(jobId);
  const allCandidates = await candidateService.listForSystemUse();

  // ATS/JD Match must reflect THIS job's own match (pc.jdMatchId), not
  // Milestone 8's workspace-level match on the candidate summary — see
  // plan design decision 1. Overriding just those two score fields
  // keeps every other CandidateSummary field (resumeScore, tags, etc.)
  // intact.
  const enriched = pipelineCandidates.map((pc) => {
    const candidate = allCandidates.find((c) => c.candidateId === pc.candidateId) ?? null;
    const jdMatchRecord = pc.jdMatchId ? jdMatchService.get(pc.jdMatchId) : undefined;

    return {
      ...pc,
      candidate: candidate
        ? {
            ...candidate,
            scores: {
              ...candidate.scores,
              atsScore: jdMatchRecord?.matchResult.atsScore ?? null,
              jdMatch: jdMatchRecord?.matchResult.overallMatch ?? null,
            },
          }
        : null,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: Request, { params }: Params) {
  const { jobId } = await params;

  try {
    const { candidateId } = await req.json();

    if (typeof candidateId !== "string" || !candidateId) {
      return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
    }

    const pipelineCandidate = await pipelineService.attachCandidate(jobId, candidateId);

    return NextResponse.json(pipelineCandidate);
  } catch (error) {
    console.error("[recruitment] Pipeline attach route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Attaching the candidate failed" }, { status: 422 });
  }
}

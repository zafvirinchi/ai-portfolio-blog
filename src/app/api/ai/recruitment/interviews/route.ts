import { NextResponse } from "next/server";

import { INTERVIEW_TYPES } from "@/lib/ai/recruitment/pipeline-schema";
import { interviewScheduler } from "@/lib/ai/recruitment/interview-scheduler";
import * as activityService from "@/lib/saas/activity-service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") ?? undefined;
  const pipelineCandidateId = url.searchParams.get("pipelineCandidateId") ?? undefined;

  return NextResponse.json(interviewScheduler.list({ jobId, pipelineCandidateId }));
}

export async function POST(req: Request) {
  try {
    const { pipelineCandidateId, type, scheduledAt, interviewer } = await req.json();

    if (typeof pipelineCandidateId !== "string" || !pipelineCandidateId) {
      return NextResponse.json({ error: "pipelineCandidateId is required" }, { status: 400 });
    }

    if (!INTERVIEW_TYPES.includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${INTERVIEW_TYPES.join(", ")}` }, { status: 400 });
    }

    if (typeof scheduledAt !== "string" || !scheduledAt) {
      return NextResponse.json({ error: "scheduledAt is required" }, { status: 400 });
    }

    const interview = interviewScheduler.schedule({ pipelineCandidateId, type, scheduledAt, interviewer: interviewer ?? null });

    await activityService.record("Interview Scheduled", `Scheduled ${interview.type} interview`, {
      interviewId: interview.interviewId,
      pipelineCandidateId: interview.pipelineCandidateId,
    });

    return NextResponse.json(interview);
  } catch (error) {
    console.error("[recruitment] Interview scheduling route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Scheduling the interview failed" }, { status: 422 });
  }
}

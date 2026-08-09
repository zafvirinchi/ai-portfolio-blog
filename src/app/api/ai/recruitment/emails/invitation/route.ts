import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { interviewScheduler } from "@/lib/ai/recruitment/interview-scheduler";
import { jobService } from "@/lib/ai/recruitment/job-service";
import { generateInterviewInvitationEmail } from "@/lib/ai/recruitment/notification-service";
import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { pipelineCandidateId, interviewId } = await req.json();

    const pc = pipelineService.get(pipelineCandidateId);
    if (!pc) return NextResponse.json({ error: "Pipeline candidate not found" }, { status: 404 });

    const job = jobService.get(pc.jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const interview = interviewScheduler.get(interviewId);
    if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

    const profile = candidateService.getProfile(pc.candidateId);
    if (!profile) return NextResponse.json({ error: "Candidate not found or their resume has expired" }, { status: 404 });

    const email = await generateInterviewInvitationEmail(job, profile.resume, interview);

    return NextResponse.json(email);
  } catch (error) {
    console.error("[recruitment] Interview invitation email route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Email generation failed" }, { status: 422 });
  }
}

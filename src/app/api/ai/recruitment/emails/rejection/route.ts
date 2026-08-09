import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { jobService } from "@/lib/ai/recruitment/job-service";
import { generateRejectionEmail } from "@/lib/ai/recruitment/notification-service";
import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { pipelineCandidateId } = await req.json();

    const pc = pipelineService.get(pipelineCandidateId);
    if (!pc) return NextResponse.json({ error: "Pipeline candidate not found" }, { status: 404 });

    const job = jobService.get(pc.jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const profile = candidateService.getProfile(pc.candidateId);
    if (!profile) return NextResponse.json({ error: "Candidate not found or their resume has expired" }, { status: 404 });

    const email = await generateRejectionEmail(job, profile.resume);

    return NextResponse.json(email);
  } catch (error) {
    console.error("[recruitment] Rejection email route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Email generation failed" }, { status: 422 });
  }
}

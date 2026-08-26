import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { interviewScheduler } from "@/lib/ai/recruitment/interview-scheduler";
import { jobService } from "@/lib/ai/recruitment/job-service";
import { generateInterviewReminderEmail } from "@/lib/ai/recruitment/notification-service";
import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";
import { requireRecruiterId, UnauthorizedError } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

export const maxDuration = 30;

// Phase 23 Milestone 5 — genuine cost defect found and fixed. See
// recommendation/route.ts's own comment for the full rationale and its
// noted residual limitation.
export async function POST(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    await requireFeature(recruiterId, "recruiter.interview");

    const { pipelineCandidateId, interviewId } = await req.json();

    const pc = pipelineService.get(pipelineCandidateId);
    if (!pc) return NextResponse.json({ error: "Pipeline candidate not found" }, { status: 404 });

    const job = jobService.get(pc.jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const interview = interviewScheduler.get(interviewId);
    if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

    const profile = await candidateService.getProfileForSystemUse(pc.candidateId);
    if (!profile) return NextResponse.json({ error: "Candidate not found or their resume has expired" }, { status: 404 });

    const email = await generateInterviewReminderEmail(job, profile.resume, interview);

    return NextResponse.json(email);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[recruitment] Interview reminder email route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Email generation failed" }, { status: 422 });
  }
}

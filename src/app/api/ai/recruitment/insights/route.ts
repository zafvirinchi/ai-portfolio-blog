import { NextResponse } from "next/server";

import { jobService } from "@/lib/ai/recruitment/job-service";
import { interviewScheduler } from "@/lib/ai/recruitment/interview-scheduler";
import { offerService } from "@/lib/ai/recruitment/offer-service";
import { computeInsights } from "@/lib/ai/recruitment/pipeline-insights";
import { pipelineService } from "@/lib/ai/recruitment/pipeline-service";

export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get("jobId");

  const pipelineCandidates = jobId ? pipelineService.list(jobId) : pipelineService.listAll();
  const job = jobId ? jobService.get(jobId) ?? null : null;
  const interviews = jobId ? interviewScheduler.list({ jobId }) : interviewScheduler.list();
  const offers = jobId ? offerService.list({ jobId }) : offerService.list();

  const insights = computeInsights({ jobId, pipelineCandidates, job, interviews, offers });

  return NextResponse.json(insights);
}

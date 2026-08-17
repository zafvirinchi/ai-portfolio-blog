import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import { recordUsage, requireQuota } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

export const maxDuration = 60;

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    const { jobId } = await req.json();

    if (typeof jobId !== "string" || !jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    // Phase 19 Milestone 3 — genuine bypass found and fixed: this route
    // had NO entitlement check at all despite calling
    // jdMatchService.analyze() (2 real LLM calls) via
    // candidateService.matchCandidate() — the same underlying pipeline
    // /api/ai/resume/jd-match gates with JD_MATCHES. Gated here with
    // RECRUITER_CANDIDATES instead — the metric recruiter.candidates/
    // recruiter.ranking already share — since this is a per-candidate
    // AI action, not a job-seeker-side one; reuses the existing shared
    // pool rather than inventing a new metric.
    await requireQuota(recruiterId, "RECRUITER_CANDIDATES");

    const record = await candidateService.matchCandidate(candidateId, recruiterId, jobId);
    await recordUsage(recruiterId, "RECRUITER_CANDIDATES");

    return NextResponse.json(record);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Matching against the job description failed");
  }
}

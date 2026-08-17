import { NextResponse } from "next/server";

import { recruiterJobService } from "@/lib/ai/recruiter/recruiter-job-service";
import { RECRUITER_JOB_STATUSES } from "@/lib/ai/recruiter/recruiter-job-types";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

export const maxDuration = 60;

type Params = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { jobId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    return NextResponse.json(await recruiterJobService.getJob(recruiterId, jobId));
  } catch (error) {
    return handleRecruiterRouteError(error, "Failed to load job");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const { jobId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    const { title, company, jobDescriptionText, status } = await req.json();

    if (status !== undefined && !RECRUITER_JOB_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${RECRUITER_JOB_STATUSES.join(", ")}` }, { status: 400 });
    }

    // Phase 21 Milestone 1 — audit finding: a jobDescriptionText change
    // here re-invokes jdParser.parse() (a real LLM call, updateJob() ->
    // recruiter-job-service.ts) with no entitlement/persona check at
    // all — matching the POST route's own fix. Only gated when the
    // expensive re-parse path is actually taken, same conditional-gate
    // convention already used by /api/ai/resume/versions's own fix for
    // the identical bug class.
    if (typeof jobDescriptionText === "string" && jobDescriptionText.trim()) {
      await requireFeature(recruiterId, "recruiter.jobs");
    }

    const job = await recruiterJobService.updateJob(recruiterId, jobId, {
      title: typeof title === "string" ? title : undefined,
      company: company === undefined ? undefined : typeof company === "string" ? company : null,
      jobDescriptionText: typeof jobDescriptionText === "string" ? jobDescriptionText : undefined,
      status,
    });

    return NextResponse.json(job);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Updating the job failed");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { jobId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    await recruiterJobService.deleteJob(recruiterId, jobId);

    return NextResponse.json({ removed: true });
  } catch (error) {
    return handleRecruiterRouteError(error, "Deleting the job failed");
  }
}

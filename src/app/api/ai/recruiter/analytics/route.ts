import { NextResponse } from "next/server";

import { getRecruiterAnalytics } from "@/lib/ai/recruiter/recruiter-analytics-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

// Phase 16 Milestone 6 — recruiterId is always server-derived via
// requireRecruiterId(), never accepted from query/body. jobId, when
// supplied, is ownership-validated inside getRecruiterAnalytics()
// before any analytics are computed — a foreign or nonexistent jobId
// both produce the same 404 (handleRecruiterRouteError's
// RecruiterJobNotFoundError mapping), never revealing which case it was.
//
// Phase 18 Milestone 5 — recruiter.analytics is NONE on Recruiter Free,
// UNLIMITED on Pro/Business. This route always has a real, authenticated
// recruiterId (requireRecruiterId() throws otherwise) — no anonymous
// path exists here, unlike the JOB_SEEKER-side ephemeral tools.
export async function GET(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    await requireFeature(recruiterId, "recruiter.analytics");
    const jobId = new URL(req.url).searchParams.get("jobId") ?? undefined;

    return NextResponse.json(await getRecruiterAnalytics(recruiterId, jobId));
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Failed to compute analytics");
  }
}

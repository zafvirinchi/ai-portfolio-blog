import { NextResponse } from "next/server";

import { getRecruiterAnalytics } from "@/lib/ai/recruiter/recruiter-analytics-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

// Phase 16 Milestone 6 — recruiterId is always server-derived via
// requireRecruiterId(), never accepted from query/body. jobId, when
// supplied, is ownership-validated inside getRecruiterAnalytics()
// before any analytics are computed — a foreign or nonexistent jobId
// both produce the same 404 (handleRecruiterRouteError's
// RecruiterJobNotFoundError mapping), never revealing which case it was.
export async function GET(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    const jobId = new URL(req.url).searchParams.get("jobId") ?? undefined;

    return NextResponse.json(await getRecruiterAnalytics(recruiterId, jobId));
  } catch (error) {
    return handleRecruiterRouteError(error, "Failed to compute analytics");
  }
}

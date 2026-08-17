import { NextResponse } from "next/server";

import { recruiterJobService } from "@/lib/ai/recruiter/recruiter-job-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

// Parses the pasted JD via jd-parser.ts (one LLM call) — same budget as
// the old job-description route this replaces.
export const maxDuration = 60;

export async function GET() {
  try {
    const recruiterId = await requireRecruiterId();
    return NextResponse.json(await recruiterJobService.listJobs(recruiterId));
  } catch (error) {
    return handleRecruiterRouteError(error, "Failed to load jobs");
  }
}

export async function POST(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    const { title, company, jobDescriptionText } = await req.json();

    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    if (typeof jobDescriptionText !== "string" || !jobDescriptionText.trim()) {
      return NextResponse.json({ error: "jobDescriptionText is required" }, { status: 400 });
    }

    // Phase 21 Milestone 1 — audit finding: this route ran a real LLM
    // call (jdParser.parse(), inside createJob()) for ANY authenticated
    // account with no entitlement/persona check at all — requireRecruiterId()
    // only proves "signed in," not that the account holds a RECRUITER
    // plan. recruiter.jobs is UNLIMITED on every RECRUITER_* plan and
    // absent from JOB_SEEKER_* plans, so this rejects a non-recruiter
    // account without adding any new quota/plan/metric.
    await requireFeature(recruiterId, "recruiter.jobs");

    const job = await recruiterJobService.createJob(recruiterId, {
      title,
      company: typeof company === "string" ? company : null,
      jobDescriptionText,
    });

    return NextResponse.json(job);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Creating the job failed");
  }
}

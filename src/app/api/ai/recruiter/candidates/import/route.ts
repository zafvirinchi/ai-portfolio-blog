import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import * as activityService from "@/lib/saas/activity-service";
import { checkQuota, recordUsage } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

// Each imported file costs a full resumeService.analyzeUpload() call
// (several OpenAI calls internally) — sequential per-file with a
// try/catch each, so one bad/slow file never fails the whole batch.
// Per the plan's design decision 5, the UI encourages batches of
// roughly 5-10 files rather than promising "hundreds in one click".
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    const formData = await req.formData();
    const fileEntries = formData.getAll("files").filter((entry): entry is File => entry instanceof File);

    if (fileEntries.length === 0) {
      return NextResponse.json({ error: "At least one resume file is required" }, { status: 400 });
    }

    // Phase 18 Milestone 5 — recruiter.candidates (NONE on Free... no,
    // LIMITED — RECRUITER_CANDIDATES — on Free/Pro, UNLIMITED on
    // Business, shared with recruiter.ranking's identical per-plan
    // limits). Checked BEFORE the expensive per-file LLM analysis below
    // — rejects the whole batch upfront if the recruiter is already at
    // or over their monthly candidate limit, rather than burning OpenAI
    // calls on files that would be rejected anyway.
    const quota = await checkQuota(recruiterId, "RECRUITER_CANDIDATES");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: `Monthly candidate limit reached (${quota.used}/${quota.limit}). Upgrade your plan for more.`, code: "QUOTA_EXCEEDED", metric: "RECRUITER_CANDIDATES", limit: quota.limit, used: quota.used, period: quota.period },
        { status: 402 }
      );
    }

    const jobIdField = formData.get("jobId");
    const jobId = typeof jobIdField === "string" && jobIdField ? jobIdField : null;

    const files = await Promise.all(fileEntries.map((file) => fromWebFile(file)));
    const result = await candidateService.importResumes(recruiterId, files, jobId);

    // One usage unit per candidate GENUINELY added — never for
    // duplicates or failed files (result.duplicates/result.failed are
    // excluded), matching Step 8's "never count a rejected/failed
    // sub-operation" rule.
    for (const candidate of result.imported) {
      await recordUsage(recruiterId, "RECRUITER_CANDIDATES");
      await activityService.record("Candidate Added", `Imported candidate: ${candidate.name}`, {
        candidateId: candidate.candidateId,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Candidate import failed");
  }
}

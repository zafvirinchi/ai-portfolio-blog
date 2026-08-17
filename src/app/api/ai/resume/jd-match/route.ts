import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { jdMatchService } from "@/lib/ai/job-description/jd-service";
import type { JobDescriptionUploadInput } from "@/lib/ai/job-description/jd-types";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
import { recordUsage, requireQuota } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";
import { getOptionalUserId } from "@/lib/billing/persona-service";
import { withUsageContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

// JD parse (1 OpenAI call) + optimization (1 OpenAI call) — same
// timeout budget as /api/ai/job-match's equivalent 2-call shape.
export const maxDuration = 60;

async function resolveJobDescription(formData: FormData): Promise<JobDescriptionUploadInput | null> {
  const jdText = formData.get("jdText");

  if (typeof jdText === "string" && jdText.trim()) {
    return { text: jdText.trim() };
  }

  const jdFile = formData.get("jdFile");

  if (jdFile instanceof File) {
    return fromWebFile(jdFile);
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const resumeId = formData.get("resumeId");

    if (typeof resumeId !== "string" || !resumeId) {
      return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
    }

    const jd = await resolveJobDescription(formData);

    if (!jd) {
      return NextResponse.json(
        { error: "Paste a job description or upload a job description file" },
        { status: 400 }
      );
    }

    await checkCredits("jd_match");

    // Phase 18 Milestone 5 — additive to the org-scoped check above,
    // same pattern as /api/ai/resume's own requireQuota() integration
    // (M1). A no-op for every anonymous request; only enforced for a
    // real signed-in user. JD_MATCHES is shared across resume.jd.match/
    // job.match/job.analyzer (entitlement-service.ts's own
    // featuresUsingMetric() doc comment) — the same monthly pool, on
    // purpose.
    const platformUserId = await getOptionalUserId();
    if (platformUserId) await requireQuota(platformUserId, "JD_MATCHES");

    const startedAt = Date.now();
    const record = await withUsageContext("JD_MATCHING", "JD_ANALYSIS", () => jdMatchService.analyze({ resumeId, jd }));
    await consumeCredits("jd_match", Date.now() - startedAt);
    // Recorded only after the analysis genuinely succeeded.
    if (platformUserId) await recordUsage(platformUserId, "JD_MATCHES");

    return NextResponse.json({
      jdMatchId: record.jdMatchId,
      jobDescription: record.jobDescription,
      ...record.matchResult,
    });
  } catch (error) {
    console.error("[jd] API route failed", error);

    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job description analysis failed" },
      { status: 422 }
    );
  }
}

import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { resumeService } from "@/lib/ai/resume";
import * as activityService from "@/lib/saas/activity-service";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
import { QuotaExceededError, recordUsage, requireQuota } from "@/lib/billing/entitlement-service";
import { getOptionalUserId } from "@/lib/billing/persona-service";
import { withUsageContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

// Parses the resume PDF/DOCX and runs it through several OpenAI calls
// (analysis, ATS scoring, skill gap) — same timeout risk as the interview
// PDF routes.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A resume file is required" }, { status: 400 });
    }

    await checkCredits("resume_upload");

    // Phase 18 Milestone 1 — representative integration (Step 16). This
    // is the ORGANIZATION-scoped check above (credit-service.ts) plus
    // this NEW, separate per-USER check, side by side — deliberately
    // additive, never a replacement. getOptionalUserId() resolves a
    // real Supabase session if one exists; when it doesn't (every
    // anonymous request, exactly as this route already behaved before
    // this milestone), requireQuota() is never even called — existing
    // anonymous behavior is completely unchanged. Provisional FREE-tier
    // limits (platform-plan-registry.ts) are intentionally generous
    // enough that no currently-working authenticated flow is rejected;
    // this proves the enforcement wiring works end-to-end without
    // silently locking anyone out of a feature billing hasn't launched
    // for yet.
    const platformUserId = await getOptionalUserId();
    if (platformUserId) await requireQuota(platformUserId, "ATS_CHECKS");

    const startedAt = Date.now();
    const raw = await fromWebFile(file);
    const result = await withUsageContext("RESUME_ANALYSIS", "LLM_CALL", () => resumeService.analyzeUpload(raw));

    await consumeCredits("resume_upload", Date.now() - startedAt);
    // Recorded only now — after the real analysis has genuinely
    // succeeded — never on a validation failure or a rejected request
    // (Step 8's own explicit rule).
    if (platformUserId) await recordUsage(platformUserId, "ATS_CHECKS");

    await activityService.record("Resume Uploaded", `Uploaded resume: ${result.filename}`, {
      resumeId: result.resumeId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[resume-agent] Resume analysis failed", error);

    if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError || error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Resume analysis failed" },
      { status: 422 }
    );
  }
}

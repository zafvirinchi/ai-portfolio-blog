import { NextResponse } from "next/server";

import { rewriteService } from "@/lib/ai/resume-rewriter/rewrite-service";
import * as activityService from "@/lib/saas/activity-service";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
import { recordUsage, requireFeature, requireQuota } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";
import { getOptionalUserId } from "@/lib/billing/persona-service";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

export async function POST(req: Request) {
  try {
    const { resumeId } = await req.json();

    if (typeof resumeId !== "string" || !resumeId) {
      return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
    }

    await checkCredits("resume_rewrite");

    // Phase 18 Milestone 5 — additive, no-op for anonymous callers.
    // resume.rewrite is NONE on the FREE plan, LIMITED (AI_REWRITES) on
    // Pro, UNLIMITED on Premium — requireFeature() first so a FREE user
    // gets an accurate FEATURE_NOT_INCLUDED (not a 0/0 "quota exceeded",
    // which requireQuota() alone would report for a NONE-access
    // feature); requireQuota() then only ever rejects a real Pro-tier
    // limit. Checked once, at session start — the whole-resume/section-
    // action follow-ups (whole-resume/route.ts, section/[section]/
    // action/route.ts) operate on an already-started, already-checked
    // session, not a new one.
    const platformUserId = await getOptionalUserId();
    if (platformUserId) {
      await requireFeature(platformUserId, "resume.rewrite");
      await requireQuota(platformUserId, "AI_REWRITES");
    }

    const record = rewriteService.start(resumeId);
    await consumeCredits("resume_rewrite");
    if (platformUserId) await recordUsage(platformUserId, "AI_REWRITES");

    await activityService.record("Resume Rewritten", `Rewrote resume: ${resumeId}`, {
      rewriteId: record.rewriteId,
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("[resume-rewriter] API route failed", error);

    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start resume rewrite" }, { status: 422 });
  }
}

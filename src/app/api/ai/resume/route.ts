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
import { checkAndRecordAnonymousUsage, getClientIp } from "@/lib/ai/rate-limiting/anonymous-ai-rate-limiter";

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

    // Phase 18 Milestone 1 — representative integration (Step 16). This
    // is the ORGANIZATION-scoped check below (credit-service.ts) plus
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
    // for yet. Resolved here (moved up from just before requireQuota())
    // so the Phase 21 Milestone 2 anonymous rate limit below can run
    // before checkCredits()/the LLM call.
    const platformUserId = await getOptionalUserId();

    // Phase 21 Milestone 2 — audit finding (Phase 21 M1 §13 Finding 3 /
    // §8): analyzeUpload() below runs several real OpenAI calls per
    // submission (analysis, ATS scoring, skill gap — see this file's own
    // top comment) with zero cost control for an anonymous caller.
    // Deliberately scoped to ONLY anonymous callers (no platformUserId):
    // an authenticated user is governed exclusively by the existing
    // requireQuota("ATS_CHECKS") call below, completely unchanged by
    // this gate. This IS the one and only expensive operation this
    // route exposes (resumeService has no other method — see
    // resume-service.ts), so the whole route is gated, not a sub-path
    // within it. Runs before checkCredits() and the LLM call — zero LLM
    // calls on rejection.
    if (!platformUserId) {
      const ip = getClientIp(req);
      const rateLimit = await checkAndRecordAnonymousUsage("resume_analyze", ip);

      if (!rateLimit.allowed) {
        const headers: Record<string, string> = {};
        if (rateLimit.retryAfterSeconds !== undefined) {
          headers["Retry-After"] = String(rateLimit.retryAfterSeconds);
        }

        return NextResponse.json(
          {
            error: `You've reached today's free limit of ${rateLimit.limit} resume analyses. Sign in for higher limits, or try again later.`,
            code: "RATE_LIMITED",
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          },
          { status: 429, headers }
        );
      }
    }

    await checkCredits("resume_upload");

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

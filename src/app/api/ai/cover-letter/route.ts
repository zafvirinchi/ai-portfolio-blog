import { NextResponse } from "next/server";

import { COVER_LETTER_LENGTHS, COVER_LETTER_STYLES } from "@/lib/ai/cover-letter/cover-schema";
import { coverLetterService } from "@/lib/ai/cover-letter/cover-service";
import * as activityService from "@/lib/saas/activity-service";
import { recordUsage, requireFeature, requireQuota } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";
import { getOptionalUserId } from "@/lib/billing/persona-service";

// One structured-output call — 3 letter variants together.
export const maxDuration = 45;

// Phase 19 Milestone 6 — genuine defect found and fixed (Phase 19 M5's
// own top finding): this route, and every one of the Cover Letter
// Generator's other 6 routes, had NO entitlement/quota/cost-control
// plumbing at all. Fixed here, at the narrowest point through which
// every cover letter session must pass: unlike LinkedIn Optimizer's
// start(), coverLetterService.start() itself performs the real, primary
// LLM call (the comment above confirms: one structured-output call
// producing all 3 style variants together — one user-visible
// generation, charged once, not 3). The follow-on regenerate/email/
// LinkedIn-message sub-actions (letter/route.ts, email/route.ts,
// linkedin/route.ts) require a coverLetterId that can ONLY be minted by
// a successful call here, so — mirroring resume-rewriter's own already-
// audited "charge once at session start" design exactly — they are
// deliberately NOT independently re-gated. Anonymous callers are
// unaffected — additive, no-op when getOptionalUserId() resolves null.
export async function POST(req: Request) {
  try {
    const { jdMatchId, companyName, hiringManager, role, style, length } = await req.json();

    if (typeof jdMatchId !== "string" || !jdMatchId) {
      return NextResponse.json({ error: "jdMatchId is required" }, { status: 400 });
    }

    if (!COVER_LETTER_STYLES.includes(style)) {
      return NextResponse.json({ error: `style must be one of: ${COVER_LETTER_STYLES.join(", ")}` }, { status: 400 });
    }

    if (!COVER_LETTER_LENGTHS.includes(length)) {
      return NextResponse.json({ error: `length must be one of: ${COVER_LETTER_LENGTHS.join(", ")}` }, { status: 400 });
    }

    const platformUserId = await getOptionalUserId();
    if (platformUserId) {
      await requireFeature(platformUserId, "job.cover_letter");
      await requireQuota(platformUserId, "COVER_LETTERS");
    }

    const record = await coverLetterService.start({
      jdMatchId,
      companyName: typeof companyName === "string" ? companyName : undefined,
      hiringManager: typeof hiringManager === "string" ? hiringManager : undefined,
      role: typeof role === "string" ? role : undefined,
      style,
      length,
    });

    if (platformUserId) await recordUsage(platformUserId, "COVER_LETTERS");

    await activityService.record("Cover Letter Generated", `Generated cover letter for jdMatch: ${jdMatchId}`, {
      coverLetterId: record.coverLetterId,
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("[cover-letter] API route failed", error);

    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start cover letter" }, { status: 422 });
  }
}

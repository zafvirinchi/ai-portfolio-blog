import { NextResponse } from "next/server";

import { rewriteService } from "@/lib/ai/resume-rewriter/rewrite-service";
import * as activityService from "@/lib/saas/activity-service";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

export async function POST(req: Request) {
  try {
    const { resumeId } = await req.json();

    if (typeof resumeId !== "string" || !resumeId) {
      return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
    }

    await checkCredits("resume_rewrite");

    const record = rewriteService.start(resumeId);
    await consumeCredits("resume_rewrite");

    await activityService.record("Resume Rewritten", `Rewrote resume: ${resumeId}`, {
      rewriteId: record.rewriteId,
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("[resume-rewriter] API route failed", error);

    if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start resume rewrite" }, { status: 422 });
  }
}

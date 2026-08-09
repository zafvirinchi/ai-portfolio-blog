import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { resumeService } from "@/lib/ai/resume";
import * as activityService from "@/lib/saas/activity-service";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
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

    const startedAt = Date.now();
    const raw = await fromWebFile(file);
    const result = await withUsageContext("RESUME_ANALYSIS", "LLM_CALL", () => resumeService.analyzeUpload(raw));

    await consumeCredits("resume_upload", Date.now() - startedAt);

    await activityService.record("Resume Uploaded", `Uploaded resume: ${result.filename}`, {
      resumeId: result.resumeId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[resume-agent] Resume analysis failed", error);

    if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Resume analysis failed" },
      { status: 422 }
    );
  }
}

import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { jdMatchService } from "@/lib/ai/job-description/jd-service";
import type { JobDescriptionUploadInput } from "@/lib/ai/job-description/jd-types";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
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

    const startedAt = Date.now();
    const record = await withUsageContext("JD_MATCHING", "JD_ANALYSIS", () => jdMatchService.analyze({ resumeId, jd }));
    await consumeCredits("jd_match", Date.now() - startedAt);

    return NextResponse.json({
      jdMatchId: record.jdMatchId,
      jobDescription: record.jobDescription,
      ...record.matchResult,
    });
  } catch (error) {
    console.error("[jd] API route failed", error);

    if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job description analysis failed" },
      { status: 422 }
    );
  }
}

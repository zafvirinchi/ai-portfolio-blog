import { NextResponse } from "next/server";

import { prepService } from "@/lib/ai/interview-prep/prep-service";
import { withUsageContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

// One structured-output call for the bulk question/answer generation —
// same maxDuration budget as the other JD-match routes.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { resumeId, jdMatchId } = await req.json();

    if (typeof resumeId !== "string" || !resumeId) {
      return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
    }

    if (typeof jdMatchId !== "string" || !jdMatchId) {
      return NextResponse.json({ error: "jdMatchId is required" }, { status: 400 });
    }

    const record = await withUsageContext("INTERVIEW_GENERATION", "INTERVIEW_GENERATION", () => prepService.generate({ resumeId, jdMatchId }));

    return NextResponse.json(record);
  } catch (error) {
    console.error("[interview-prep] API route failed", error);

    if (error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Interview preparation failed" },
      { status: 422 }
    );
  }
}

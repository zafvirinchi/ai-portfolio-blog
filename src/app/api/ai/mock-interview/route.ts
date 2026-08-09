import { NextResponse } from "next/server";

import { INTERVIEW_TYPES, SESSION_MODES } from "@/lib/ai/mock-interview/session-schema";
import { sessionService } from "@/lib/ai/mock-interview/session-service";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
import { withUsageContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

// The first question can come from a real LLM fallback call — same budget
// as the other "starts a multi-step pipeline" routes in this arc.
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { resumeId, jdMatchId, prepId, interviewType, mode } = await req.json();

    if (typeof resumeId !== "string" || !resumeId) {
      return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
    }

    if (typeof jdMatchId !== "string" || !jdMatchId) {
      return NextResponse.json({ error: "jdMatchId is required" }, { status: 400 });
    }

    if (!INTERVIEW_TYPES.includes(interviewType)) {
      return NextResponse.json({ error: `interviewType must be one of: ${INTERVIEW_TYPES.join(", ")}` }, { status: 400 });
    }

    if (!SESSION_MODES.includes(mode)) {
      return NextResponse.json({ error: `mode must be one of: ${SESSION_MODES.join(", ")}` }, { status: 400 });
    }

    await checkCredits("mock_interview");

    const startedAt = Date.now();
    const result = await withUsageContext("MOCK_INTERVIEW", "LLM_CALL", () =>
      sessionService.start({
        resumeId,
        jdMatchId,
        prepId: typeof prepId === "string" && prepId ? prepId : undefined,
        interviewType,
        mode,
      })
    );
    await consumeCredits("mock_interview", Date.now() - startedAt);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[mock-interview] API route failed", error);

    if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start mock interview" }, { status: 422 });
  }
}

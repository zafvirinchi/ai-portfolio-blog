import { NextResponse } from "next/server";

import { sessionService } from "@/lib/ai/mock-interview/session-service";
import { withUsageContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

export const maxDuration = 30;

type Params = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { sessionId } = await params;

  try {
    const { answerText } = await req.json();

    if (typeof answerText !== "string") {
      return NextResponse.json({ error: "answerText is required" }, { status: 400 });
    }

    const result = await withUsageContext("INTERVIEW_EVALUATION", "INTERVIEW_EVALUATION", () => sessionService.submitAnswer(sessionId, answerText));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[mock-interview] Answer route failed", error);

    if (error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to submit answer" }, { status: 422 });
  }
}

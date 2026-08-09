import { NextResponse } from "next/server";

import { prepService } from "@/lib/ai/interview-prep/prep-service";

export const maxDuration = 30;

type Params = {
  params: Promise<{ prepId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { prepId } = await params;

  try {
    const { question } = await req.json();

    if (typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const answer = await prepService.regenerateAnswer(prepId, question.trim());

    return NextResponse.json(answer);
  } catch (error) {
    console.error("[interview-prep] Answer route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Answer generation failed" },
      { status: 422 }
    );
  }
}

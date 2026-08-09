import { NextResponse } from "next/server";

import { interviewScheduler } from "@/lib/ai/recruitment/interview-scheduler";

export const maxDuration = 30;

type Params = {
  params: Promise<{ interviewId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { interviewId } = await params;

  try {
    const interview = await interviewScheduler.generateFeedbackSummary(interviewId);
    return NextResponse.json(interview);
  } catch (error) {
    console.error("[recruitment] Feedback summary route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Feedback summary generation failed" }, { status: 422 });
  }
}

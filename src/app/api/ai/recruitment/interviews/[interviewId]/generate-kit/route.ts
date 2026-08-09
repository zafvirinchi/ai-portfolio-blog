import { NextResponse } from "next/server";

import { interviewScheduler } from "@/lib/ai/recruitment/interview-scheduler";

export const maxDuration = 60;

type Params = {
  params: Promise<{ interviewId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { interviewId } = await params;

  try {
    const interview = await interviewScheduler.generateInterviewKit(interviewId);
    return NextResponse.json(interview);
  } catch (error) {
    console.error("[recruitment] Interview kit route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Interview kit generation failed" }, { status: 422 });
  }
}

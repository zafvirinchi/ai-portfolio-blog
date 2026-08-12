import { NextResponse } from "next/server";

import { INTERVIEW_STATUSES } from "@/lib/ai/recruitment/pipeline-schema";
import { interviewScheduler } from "@/lib/ai/recruitment/interview-scheduler";

type Params = {
  params: Promise<{ interviewId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { interviewId } = await params;

  try {
    const { status } = await req.json();

    if (!INTERVIEW_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${INTERVIEW_STATUSES.join(", ")}` }, { status: 400 });
    }

    const interview = await interviewScheduler.updateStatus(interviewId, status);

    return NextResponse.json(interview);
  } catch (error) {
    console.error("[recruitment] Interview status route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Interview status update failed" }, { status: 422 });
  }
}

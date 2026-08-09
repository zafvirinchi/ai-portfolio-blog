import { NextResponse } from "next/server";

import { ACTING_ROLES } from "@/lib/ai/recruitment/pipeline-schema";
import { interviewScheduler } from "@/lib/ai/recruitment/interview-scheduler";

type Params = {
  params: Promise<{ interviewId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { interviewId } = await params;

  try {
    const { rating, notes, actingRole } = await req.json();

    if (typeof rating !== "number") {
      return NextResponse.json({ error: "rating (1-5) is required" }, { status: 400 });
    }

    if (typeof notes !== "string" || !notes.trim()) {
      return NextResponse.json({ error: "notes is required" }, { status: 400 });
    }

    const resolvedRole = ACTING_ROLES.includes(actingRole) ? actingRole : null;
    const interview = interviewScheduler.recordFeedback(interviewId, { rating, notes: notes.trim(), actingRole: resolvedRole });

    return NextResponse.json(interview);
  } catch (error) {
    console.error("[recruitment] Feedback route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Recording feedback failed" }, { status: 422 });
  }
}

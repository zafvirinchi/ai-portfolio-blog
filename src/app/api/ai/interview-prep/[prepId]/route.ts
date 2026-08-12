import { NextResponse } from "next/server";

import { prepService } from "@/lib/ai/interview-prep/prep-service";

// Phase 17 Milestone 7 — production-readiness audit finding: no route
// existed to look up an ALREADY-GENERATED interview preparation report by
// its own prepId (only the coverage/answer/export sub-routes did, each
// requiring a prepId that had to come from somewhere first). This left
// every "back to your Interview Dashboard" link elsewhere in Phase 17
// (Mock Interview's Debrief/Progress tabs) unable to do anything but send
// the user to a blank "Generate a new report" screen — silently
// abandoning the very report those tabs' own coverage/study-plan data
// came from and wasting a fresh LLM generation call for no reason.
//
// Read-only, unauthenticated, exactly like every sibling interview-prep
// route (prepId is itself the unguessable ephemeral capability token —
// the same model this whole product family already uses; see
// coverage/route.ts's own identical comment).
export async function GET(_req: Request, { params }: { params: Promise<{ prepId: string }> }) {
  const { prepId } = await params;

  const record = prepService.get(prepId);

  if (!record) {
    return NextResponse.json({ error: "Interview preparation report not found or expired." }, { status: 404 });
  }

  return NextResponse.json(record);
}

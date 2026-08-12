import { NextResponse } from "next/server";

import { buildSessionDebrief, SessionDebriefNotFoundError, SessionNotCompletedError } from "@/lib/ai/mock-interview/session-debrief";

// Phase 17 Milestone 5 — read-only, deterministic, zero-LLM debrief over
// an already-completed mock interview session. Same ownership model as
// every other route in this ephemeral-tools family (GET .../[sessionId],
// .../export, .../hint): sessionId itself is the bearer capability — no
// separate user/auth concept exists for mock-interview sessions (see the
// milestone's final report, "Security/ownership model", for why adding
// one here would be a parallel architecture change out of this
// milestone's scope). All resume/JD/prep/score/coverage data is derived
// server-side from the session record itself; nothing is accepted from
// the client as authoritative input.

type Params = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { sessionId } = await params;

  try {
    const debrief = buildSessionDebrief(sessionId);
    return NextResponse.json(debrief);
  } catch (error) {
    if (error instanceof SessionDebriefNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof SessionNotCompletedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("[mock-interview] Debrief route failed", error);
    return NextResponse.json({ error: "Failed to generate the session debrief." }, { status: 500 });
  }
}

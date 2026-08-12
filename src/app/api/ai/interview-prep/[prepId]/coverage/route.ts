import { NextResponse } from "next/server";

import { computeInterviewIntelligence, InterviewIntelligenceNotFoundError } from "@/lib/ai/interview-prep/interview-intelligence-service";

// Phase 17 Milestone 3 — read-only, deterministic, zero-LLM analysis
// over an already-generated report (see interview-intelligence-service.ts's
// own doc comment). Unauthenticated, exactly like every other
// interview-prep route (prepId is itself an unguessable ephemeral
// capability token — the same model Milestone 1 documented for this
// entire product family).
export async function GET(_req: Request, { params }: { params: Promise<{ prepId: string }> }) {
  const { prepId } = await params;

  try {
    const intelligence = computeInterviewIntelligence(prepId);
    return NextResponse.json(intelligence);
  } catch (error) {
    if (error instanceof InterviewIntelligenceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("[interview-prep] Coverage route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Interview coverage calculation failed" },
      { status: 422 }
    );
  }
}

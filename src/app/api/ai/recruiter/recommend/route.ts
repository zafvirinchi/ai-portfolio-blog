import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const topN = typeof body?.topN === "number" && body.topN > 0 ? body.topN : 5;

    const result = await candidateService.recommendTopCandidates(topN);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[recruiter] Recommend route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Recommendation failed" }, { status: 422 });
  }
}

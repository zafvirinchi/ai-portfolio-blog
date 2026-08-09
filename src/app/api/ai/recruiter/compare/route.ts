import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { candidateIds } = await req.json();

    if (!Array.isArray(candidateIds) || !candidateIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "candidateIds must be an array of strings" }, { status: 400 });
    }

    const result = await candidateService.compare(candidateIds);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[recruiter] Compare route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Comparison failed" }, { status: 422 });
  }
}

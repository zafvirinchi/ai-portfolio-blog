import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

// Matches every unmatched candidate against the newly-set JD in one
// request — one jdMatchService.analyze() call per candidate (design
// decision 3), so this can take a while with many candidates already
// imported.
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Paste a job description" }, { status: 400 });
    }

    const result = await candidateService.setJobDescription(text.trim());

    return NextResponse.json(result);
  } catch (error) {
    console.error("[recruiter] Job description route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Setting the job description failed" }, { status: 422 });
  }
}

export async function GET() {
  return NextResponse.json({ text: candidateService.getActiveJobDescription() });
}

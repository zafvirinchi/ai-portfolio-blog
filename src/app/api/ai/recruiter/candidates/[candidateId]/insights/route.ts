import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

export const maxDuration = 30;

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const record = await candidateService.generateInsights(candidateId);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[recruiter] Insights route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Insights generation failed" }, { status: 422 });
  }
}

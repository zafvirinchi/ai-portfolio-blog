import { NextResponse } from "next/server";

import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";

export const maxDuration = 30;

type Params = {
  params: Promise<{ linkedinId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { linkedinId } = await params;

  try {
    const record = await linkedinService.generateSkillsSection(linkedinId);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] Skills route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Skills generation failed" }, { status: 422 });
  }
}

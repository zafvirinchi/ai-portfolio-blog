import { NextResponse } from "next/server";

import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";

export const maxDuration = 45;

type Params = {
  params: Promise<{ linkedinId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { linkedinId } = await params;

  try {
    const record = await linkedinService.generateProjectsSection(linkedinId);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] Projects route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Project generation failed" }, { status: 422 });
  }
}

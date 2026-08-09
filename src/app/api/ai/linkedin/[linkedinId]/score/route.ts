import { NextResponse } from "next/server";

import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";

type Params = {
  params: Promise<{ linkedinId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { linkedinId } = await params;

  try {
    const record = linkedinService.computeScore(linkedinId);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] Score route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Profile score computation failed" }, { status: 422 });
  }
}

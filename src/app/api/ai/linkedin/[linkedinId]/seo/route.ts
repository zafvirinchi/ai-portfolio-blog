import { NextResponse } from "next/server";

import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";

type Params = {
  params: Promise<{ linkedinId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { linkedinId } = await params;

  try {
    const record = linkedinService.computeSeo(linkedinId);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] SEO route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "SEO analysis failed" }, { status: 422 });
  }
}

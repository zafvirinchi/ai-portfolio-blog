import { NextResponse } from "next/server";

import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";

type Params = {
  params: Promise<{ linkedinId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { linkedinId } = await params;

  try {
    const record = linkedinService.computeFeatured(linkedinId);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] Featured route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Featured computation failed" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";

import { HEADLINE_STYLES } from "@/lib/ai/linkedin/linkedin-schema";
import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";

type Params = {
  params: Promise<{ linkedinId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { linkedinId } = await params;

  try {
    const { style } = await req.json();

    if (!HEADLINE_STYLES.includes(style)) {
      return NextResponse.json({ error: `style must be one of: ${HEADLINE_STYLES.join(", ")}` }, { status: 400 });
    }

    const record = linkedinService.acceptHeadline(linkedinId, style);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] Headline accept route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to accept headline" }, { status: 422 });
  }
}

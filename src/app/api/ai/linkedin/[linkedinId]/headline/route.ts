import { NextResponse } from "next/server";

import { HEADLINE_STYLES } from "@/lib/ai/linkedin/linkedin-schema";
import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";

export const maxDuration = 30;

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

    const record = await linkedinService.generateHeadlineForStyle(linkedinId, style);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] Headline route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Headline generation failed" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";

import { ABOUT_STYLES } from "@/lib/ai/linkedin/linkedin-schema";
import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";

export const maxDuration = 30;

type Params = {
  params: Promise<{ linkedinId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { linkedinId } = await params;

  try {
    const { storyType } = await req.json();

    if (!ABOUT_STYLES.includes(storyType)) {
      return NextResponse.json({ error: `storyType must be one of: ${ABOUT_STYLES.join(", ")}` }, { status: 400 });
    }

    const record = await linkedinService.generateAboutForStyle(linkedinId, storyType);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] About route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "About generation failed" }, { status: 422 });
  }
}

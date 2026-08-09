import { NextResponse } from "next/server";

import { ABOUT_STYLES } from "@/lib/ai/linkedin/linkedin-schema";
import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";

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

    const record = linkedinService.acceptAbout(linkedinId, storyType);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] About accept route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to accept About section" }, { status: 422 });
  }
}

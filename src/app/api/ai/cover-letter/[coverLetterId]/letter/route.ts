import { NextResponse } from "next/server";

import { COVER_LETTER_LENGTHS, COVER_LETTER_STYLES } from "@/lib/ai/cover-letter/cover-schema";
import { coverLetterService } from "@/lib/ai/cover-letter/cover-service";

export const maxDuration = 45;

type Params = {
  params: Promise<{ coverLetterId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { coverLetterId } = await params;

  try {
    const { style, length } = await req.json();

    if (style !== undefined && !COVER_LETTER_STYLES.includes(style)) {
      return NextResponse.json({ error: `style must be one of: ${COVER_LETTER_STYLES.join(", ")}` }, { status: 400 });
    }

    if (length !== undefined && !COVER_LETTER_LENGTHS.includes(length)) {
      return NextResponse.json({ error: `length must be one of: ${COVER_LETTER_LENGTHS.join(", ")}` }, { status: 400 });
    }

    const record = await coverLetterService.regenerateLetter(coverLetterId, style, length);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[cover-letter] Letter route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Cover letter regeneration failed" }, { status: 422 });
  }
}

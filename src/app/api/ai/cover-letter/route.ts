import { NextResponse } from "next/server";

import { COVER_LETTER_LENGTHS, COVER_LETTER_STYLES } from "@/lib/ai/cover-letter/cover-schema";
import { coverLetterService } from "@/lib/ai/cover-letter/cover-service";
import * as activityService from "@/lib/saas/activity-service";

// One structured-output call — 3 letter variants together.
export const maxDuration = 45;

export async function POST(req: Request) {
  try {
    const { jdMatchId, companyName, hiringManager, role, style, length } = await req.json();

    if (typeof jdMatchId !== "string" || !jdMatchId) {
      return NextResponse.json({ error: "jdMatchId is required" }, { status: 400 });
    }

    if (!COVER_LETTER_STYLES.includes(style)) {
      return NextResponse.json({ error: `style must be one of: ${COVER_LETTER_STYLES.join(", ")}` }, { status: 400 });
    }

    if (!COVER_LETTER_LENGTHS.includes(length)) {
      return NextResponse.json({ error: `length must be one of: ${COVER_LETTER_LENGTHS.join(", ")}` }, { status: 400 });
    }

    const record = await coverLetterService.start({
      jdMatchId,
      companyName: typeof companyName === "string" ? companyName : undefined,
      hiringManager: typeof hiringManager === "string" ? hiringManager : undefined,
      role: typeof role === "string" ? role : undefined,
      style,
      length,
    });

    await activityService.record("Cover Letter Generated", `Generated cover letter for jdMatch: ${jdMatchId}`, {
      coverLetterId: record.coverLetterId,
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("[cover-letter] API route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start cover letter" }, { status: 422 });
  }
}

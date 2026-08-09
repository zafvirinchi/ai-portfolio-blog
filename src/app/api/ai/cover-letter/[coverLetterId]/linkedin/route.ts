import { NextResponse } from "next/server";

import { coverLetterService } from "@/lib/ai/cover-letter/cover-service";

export const maxDuration = 30;

type Params = {
  params: Promise<{ coverLetterId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { coverLetterId } = await params;

  try {
    const record = await coverLetterService.generateLinkedinMessages(coverLetterId);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[cover-letter] LinkedIn route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "LinkedIn message generation failed" }, { status: 422 });
  }
}

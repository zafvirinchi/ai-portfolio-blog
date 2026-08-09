import { NextResponse } from "next/server";

import { EMAIL_AUDIENCES } from "@/lib/ai/cover-letter/cover-schema";
import { coverLetterService } from "@/lib/ai/cover-letter/cover-service";

export const maxDuration = 30;

type Params = {
  params: Promise<{ coverLetterId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { coverLetterId } = await params;

  try {
    const { audience } = await req.json();

    if (!EMAIL_AUDIENCES.includes(audience)) {
      return NextResponse.json({ error: `audience must be one of: ${EMAIL_AUDIENCES.join(", ")}` }, { status: 400 });
    }

    const record = await coverLetterService.generateEmail(coverLetterId, audience);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[cover-letter] Email route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Email generation failed" }, { status: 422 });
  }
}

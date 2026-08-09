import { NextResponse } from "next/server";

import { coverLetterService } from "@/lib/ai/cover-letter/cover-service";

type Params = {
  params: Promise<{ coverLetterId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { coverLetterId } = await params;
  const record = coverLetterService.get(coverLetterId);

  if (!record) {
    return NextResponse.json({ error: "Cover letter session not found or expired" }, { status: 404 });
  }

  return NextResponse.json(record);
}

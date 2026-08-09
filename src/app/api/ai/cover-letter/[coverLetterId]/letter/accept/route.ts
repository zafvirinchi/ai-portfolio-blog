import { NextResponse } from "next/server";

import { VARIANT_VERSIONS } from "@/lib/ai/cover-letter/cover-schema";
import { coverLetterService } from "@/lib/ai/cover-letter/cover-service";

type Params = {
  params: Promise<{ coverLetterId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { coverLetterId } = await params;

  try {
    const { version } = await req.json();

    if (!VARIANT_VERSIONS.includes(version)) {
      return NextResponse.json({ error: `version must be one of: ${VARIANT_VERSIONS.join(", ")}` }, { status: 400 });
    }

    const record = coverLetterService.acceptLetterVariant(coverLetterId, version);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[cover-letter] Accept route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to accept variant" }, { status: 422 });
  }
}

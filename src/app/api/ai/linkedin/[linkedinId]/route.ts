import { NextResponse } from "next/server";

import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";

type Params = {
  params: Promise<{ linkedinId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { linkedinId } = await params;
  const record = linkedinService.get(linkedinId);

  if (!record) {
    return NextResponse.json({ error: "LinkedIn optimizer session not found or expired" }, { status: 404 });
  }

  return NextResponse.json(record);
}

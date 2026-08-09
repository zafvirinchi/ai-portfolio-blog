import { NextResponse } from "next/server";

import { sessionService } from "@/lib/ai/mock-interview/session-service";

export const maxDuration = 20;

type Params = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { sessionId } = await params;

  try {
    const hint = await sessionService.getHint(sessionId);

    return NextResponse.json({ hint });
  } catch (error) {
    console.error("[mock-interview] Hint route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate hint" }, { status: 422 });
  }
}

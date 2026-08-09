import { NextResponse } from "next/server";

import { sessionService } from "@/lib/ai/mock-interview/session-service";

type Params = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { sessionId } = await params;
  const session = sessionService.get(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Mock interview session not found or expired" }, { status: 404 });
  }

  return NextResponse.json(session);
}

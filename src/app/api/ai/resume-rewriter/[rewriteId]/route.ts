import { NextResponse } from "next/server";

import { rewriteService } from "@/lib/ai/resume-rewriter/rewrite-service";

type Params = {
  params: Promise<{ rewriteId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { rewriteId } = await params;
  const record = rewriteService.get(rewriteId);

  if (!record) {
    return NextResponse.json({ error: "Resume rewrite session not found or expired" }, { status: 404 });
  }

  return NextResponse.json(record);
}

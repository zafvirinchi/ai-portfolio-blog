import { NextResponse } from "next/server";

import { rewriteService } from "@/lib/ai/resume-rewriter/rewrite-service";

type Params = {
  params: Promise<{ rewriteId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { rewriteId } = await params;

  try {
    const record = rewriteService.resetWholeResume(rewriteId);

    return NextResponse.json(record);
  } catch (error) {
    console.error("[resume-rewriter] Reset route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Reset failed" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";

import { REWRITE_STYLES } from "@/lib/ai/resume-rewriter/rewrite-schema";
import { rewriteService } from "@/lib/ai/resume-rewriter/rewrite-service";

// One structured-output call covering summary + experience + projects +
// skills + achievements together.
export const maxDuration = 60;

type Params = {
  params: Promise<{ rewriteId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { rewriteId } = await params;

  try {
    const { style, targetContext } = await req.json();

    if (!REWRITE_STYLES.includes(style)) {
      return NextResponse.json({ error: `style must be one of: ${REWRITE_STYLES.join(", ")}` }, { status: 400 });
    }

    const entry = await rewriteService.rewriteWholeResume(rewriteId, style, typeof targetContext === "string" ? targetContext : undefined);

    return NextResponse.json(entry);
  } catch (error) {
    console.error("[resume-rewriter] Whole-resume route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Whole-resume rewrite failed" }, { status: 422 });
  }
}

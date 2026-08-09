import { NextResponse } from "next/server";

import { REWRITE_SECTIONS, REWRITE_STYLES } from "@/lib/ai/resume-rewriter/rewrite-schema";
import { rewriteService } from "@/lib/ai/resume-rewriter/rewrite-service";
import { withUsageContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

// One structured-output call per section (variants included in the same
// call) — same budget as the other "one real LLM call" routes in this arc.
export const maxDuration = 45;

type Params = {
  params: Promise<{ rewriteId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { rewriteId } = await params;

  try {
    const { section, style, targetContext, itemIndex } = await req.json();

    if (!REWRITE_SECTIONS.includes(section)) {
      return NextResponse.json({ error: `section must be one of: ${REWRITE_SECTIONS.join(", ")}` }, { status: 400 });
    }

    if (!REWRITE_STYLES.includes(style)) {
      return NextResponse.json({ error: `style must be one of: ${REWRITE_STYLES.join(", ")}` }, { status: 400 });
    }

    const pending = await withUsageContext("RESUME_REWRITE", "REWRITE", () =>
      rewriteService.rewriteSection(rewriteId, {
        section,
        style,
        targetContext: typeof targetContext === "string" ? targetContext : undefined,
        itemIndex: typeof itemIndex === "number" ? itemIndex : undefined,
      })
    );

    return NextResponse.json(pending);
  } catch (error) {
    console.error("[resume-rewriter] Section route failed", error);

    if (error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Section rewrite failed" }, { status: 422 });
  }
}

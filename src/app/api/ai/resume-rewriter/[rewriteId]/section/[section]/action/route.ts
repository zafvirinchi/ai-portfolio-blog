import { NextResponse } from "next/server";

import { REWRITE_SECTIONS } from "@/lib/ai/resume-rewriter/rewrite-schema";
import { rewriteService } from "@/lib/ai/resume-rewriter/rewrite-service";

type Params = {
  params: Promise<{ rewriteId: string; section: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { rewriteId, section } = await params;

  try {
    if (!REWRITE_SECTIONS.includes(section as (typeof REWRITE_SECTIONS)[number])) {
      return NextResponse.json({ error: `section must be one of: ${REWRITE_SECTIONS.join(", ")}` }, { status: 400 });
    }

    const { action, variantVersion, itemSelections, versionIndex } = await req.json();

    if (action !== "accept" && action !== "reject" && action !== "restore") {
      return NextResponse.json({ error: "action must be one of: accept, reject, restore" }, { status: 400 });
    }

    const state = rewriteService.sectionAction(rewriteId, section as (typeof REWRITE_SECTIONS)[number], {
      action,
      variantVersion,
      itemSelections,
      versionIndex,
    });

    return NextResponse.json(state);
  } catch (error) {
    console.error("[resume-rewriter] Section action route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Section action failed" }, { status: 422 });
  }
}

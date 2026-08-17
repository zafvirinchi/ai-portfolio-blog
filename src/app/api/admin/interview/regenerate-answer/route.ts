import { NextResponse } from "next/server";

import { generateDocumentAnswer, formatGeneratedAnswer } from "@/lib/ai/interview-document";
import { requireAdminRoute } from "@/lib/billing/admin-api-guard";

// On-demand, single-question AI generation for Admin Review's "Regenerate
// Answer" / compare-with-original action. Does not touch the database and
// does not overwrite anything itself — it just returns a candidate answer
// for the admin to compare against the original and choose Keep Original /
// Keep AI / Merge Both.
export async function POST(req: Request) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  try {
    const { question, category, topic } = await req.json();

    if (typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const generated = await generateDocumentAnswer(
      question,
      typeof category === "string" && category.trim() ? category : "General",
      typeof topic === "string" && topic.trim() ? topic : "General"
    );

    return NextResponse.json({ answer: formatGeneratedAnswer(generated) });
  } catch (error) {
    console.error("[interview-document] Regenerate-answer API route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Answer regeneration failed" },
      { status: 500 }
    );
  }
}

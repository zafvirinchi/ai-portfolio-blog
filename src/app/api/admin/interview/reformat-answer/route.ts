import { NextResponse } from "next/server";

import { reformatPreservedAnswer } from "@/lib/ai/interview-document";
import { requireAdminRoute } from "@/lib/billing/admin-api-guard";

// Light-touch formatting cleanup for an admin-authored answer (manual
// add/edit form) — same facts and wording, just restores paragraph breaks
// and list/table structure, the same reformatPreservedAnswer() used for
// preserved PDF-import answers. Distinct from regenerate-answer/route.ts,
// which writes a brand-new answer from scratch; this only touches
// presentation. Does not touch the database — the admin reviews the result
// in the form before saving.
export async function POST(req: Request) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  try {
    const { question, answer } = await req.json();

    if (typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json({ error: "answer is required" }, { status: 400 });
    }

    const reformatted = await reformatPreservedAnswer(
      typeof question === "string" && question.trim() ? question : "Interview question",
      answer
    );

    return NextResponse.json({ answer: reformatted });
  } catch (error) {
    console.error("[interview-document] Reformat-answer API route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Answer formatting failed" },
      { status: 500 }
    );
  }
}

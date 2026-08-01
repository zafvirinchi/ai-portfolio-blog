import { NextResponse } from "next/server";
import { z } from "zod";

import { interviewImportService } from "@/lib/ai/interview-import";

const confirmQuestionSchema = z.object({
  question: z.string().min(1),
  category: z.string().min(1),
  topic: z.string().min(1),
  answer: z.string(),
  answerSource: z.enum(["ORIGINAL", "GENERATED"]),
  confidence: z.number().min(0).max(1),
  order: z.number(),
  documentName: z.string().min(1),
  diagramUrl: z.string().nullable().optional(),
});

const confirmRequestSchema = z.object({
  questions: z.array(confirmQuestionSchema).min(1),
  qualityScore: z.number().min(0).max(100),
});

// Writes an admin-approved/edited question set to the database via the
// existing (unchanged) interview-import service — the same
// InterviewImportService.import() the old one-shot upload route already
// used, just now invoked with data that's passed through Admin Review
// first instead of straight from raw extraction. answer_source and
// quality_score are attached per question here; question-service.ts
// degrades gracefully if those columns don't exist yet (see
// supabase/migrations).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = confirmRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid review payload: ${parsed.error.message}` },
        { status: 400 }
      );
    }

    const { questions, qualityScore } = parsed.data;
    const filename = questions[0]?.documentName ?? "admin-review";

    const importResult = await interviewImportService.import({
      filename,
      questions: questions.map((question) => ({ ...question, qualityScore })),
    });

    return NextResponse.json({ import: importResult });
  } catch (error) {
    console.error("[interview-document] Confirm-import API route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Interview import failed" },
      { status: 500 }
    );
  }
}

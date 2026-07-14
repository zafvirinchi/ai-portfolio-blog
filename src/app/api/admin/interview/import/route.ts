import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { InterviewExtractionService } from "@/lib/ai/interview";
import { interviewImportService } from "@/lib/ai/interview-import";

// Upload -> Extraction -> AI Generation -> Import -> Return Summary.
// Reuses InterviewExtractionService (Milestone 1/2, unchanged) and
// InterviewImportService (Milestone 3) — no logic duplicated here.
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "An interview document file is required" }, { status: 400 });
    }

    const raw = await fromWebFile(file);
    const extractionService = new InterviewExtractionService();
    const document = await extractionService.extract(raw, { generateAnswers: true });

    if (document.questions.length === 0) {
      return NextResponse.json(
        {
          error: document.errors[0] ?? "No questions could be extracted from this document.",
          extraction: {
            filename: document.filename,
            metadata: document.metadata,
            errors: document.errors,
          },
        },
        { status: 422 }
      );
    }

    const importResult = await interviewImportService.import(document);

    return NextResponse.json({
      extraction: {
        filename: document.filename,
        metadata: document.metadata,
        errors: document.errors,
      },
      import: importResult,
    });
  } catch (error) {
    console.error("[interview-import] API route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Interview import failed" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { interviewDocumentService } from "@/lib/ai/interview-document";

// Dry-run extraction only — no database writes. Runs the full Phase 11.5
// pipeline (layout -> question/answer/topic detection -> preserve-or-
// generate answers -> validation -> quality score) and returns the result
// for Admin Review. Confirming the import is a separate step
// (confirm-import/route.ts), once an admin has edited/approved questions.
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "An interview document file is required" }, { status: 400 });
    }

    const raw = await fromWebFile(file);
    const result = await interviewDocumentService.process(raw);

    if (result.questions.length === 0) {
      return NextResponse.json(
        {
          error: "No questions could be extracted from this document.",
          filename: result.filename,
          removed: result.removed,
          quality: result.quality,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[interview-document] Extract API route failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Interview document extraction failed" },
      { status: 500 }
    );
  }
}

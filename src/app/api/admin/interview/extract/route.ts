import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { interviewDocumentService } from "@/lib/ai/interview-document";
import { requireAdminRoute } from "@/lib/billing/admin-api-guard";

// Parses the PDF, reformats/generates answers via OpenAI (one call per
// question), and extracts+uploads diagrams — comfortably exceeds Vercel's
// default 15s function timeout for documents with more than a handful of
// questions. 60s is Hobby's current max; bump if upgrading plans.
export const maxDuration = 60;

// Dry-run extraction only — no database writes. Runs the full Phase 11.5
// pipeline (layout -> question/answer/topic detection -> preserve-or-
// generate answers -> validation -> quality score) and returns the result
// for Admin Review. Confirming the import is a separate step
// (confirm-import/route.ts), once an admin has edited/approved questions.
export async function POST(req: Request) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

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

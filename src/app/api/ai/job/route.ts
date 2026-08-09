import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { jobService } from "@/lib/ai/job/job-service";

// One OpenAI structured-output call — same timeout budget as
// /api/ai/resume's equivalent single-call shape.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A job description file is required" }, { status: 400 });
    }

    const input = await fromWebFile(file);
    const record = await jobService.parseFile(input);

    return NextResponse.json({
      jobId: record.jobId,
      filename: record.filename,
      processingTime: record.processingTimeMs,
      ...record.jobDescription,
    });
  } catch (error) {
    console.error("[job-agent] API route failed", error);

    // Every failure here — unsupported format (images/Excel/Zip/...), no
    // extractable text, or a schema-validation failure — is a client-side
    // input problem, not a server error, so all of them return 422.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job description parsing failed" },
      { status: 422 }
    );
  }
}

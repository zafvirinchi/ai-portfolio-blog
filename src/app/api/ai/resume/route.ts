import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { resumeService } from "@/lib/ai/resume";

// Parses the resume PDF/DOCX and runs it through several OpenAI calls
// (analysis, ATS scoring, skill gap) — same timeout risk as the interview
// PDF routes.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A resume file is required" }, { status: 400 });
    }

    const raw = await fromWebFile(file);
    const result = await resumeService.analyzeUpload(raw);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[resume-agent] Resume analysis failed", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Resume analysis failed" },
      { status: 422 }
    );
  }
}

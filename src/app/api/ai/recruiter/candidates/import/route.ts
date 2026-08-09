import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import * as activityService from "@/lib/saas/activity-service";

// Each imported file costs a full resumeService.analyzeUpload() call
// (several OpenAI calls internally) — sequential per-file with a
// try/catch each, so one bad/slow file never fails the whole batch.
// Per the plan's design decision 5, the UI encourages batches of
// roughly 5-10 files rather than promising "hundreds in one click".
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const fileEntries = formData.getAll("files").filter((entry): entry is File => entry instanceof File);

    if (fileEntries.length === 0) {
      return NextResponse.json({ error: "At least one resume file is required" }, { status: 400 });
    }

    const files = await Promise.all(fileEntries.map((file) => fromWebFile(file)));
    const result = await candidateService.importResumes(files);

    for (const candidate of result.imported) {
      await activityService.record("Candidate Added", `Imported candidate: ${candidate.name}`, {
        candidateId: candidate.candidateId,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[recruiter] Candidate import route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Candidate import failed" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";

import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import * as activityService from "@/lib/saas/activity-service";

// Each imported file costs a full resumeService.analyzeUpload() call
// (several OpenAI calls internally) — sequential per-file with a
// try/catch each, so one bad/slow file never fails the whole batch.
// Per the plan's design decision 5, the UI encourages batches of
// roughly 5-10 files rather than promising "hundreds in one click".
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    const formData = await req.formData();
    const fileEntries = formData.getAll("files").filter((entry): entry is File => entry instanceof File);

    if (fileEntries.length === 0) {
      return NextResponse.json({ error: "At least one resume file is required" }, { status: 400 });
    }

    const jobIdField = formData.get("jobId");
    const jobId = typeof jobIdField === "string" && jobIdField ? jobIdField : null;

    const files = await Promise.all(fileEntries.map((file) => fromWebFile(file)));
    const result = await candidateService.importResumes(recruiterId, files, jobId);

    for (const candidate of result.imported) {
      await activityService.record("Candidate Added", `Imported candidate: ${candidate.name}`, {
        candidateId: candidate.candidateId,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleRecruiterRouteError(error, "Candidate import failed");
  }
}

import { NextResponse } from "next/server";

import { recruiterJobService } from "@/lib/ai/recruiter/recruiter-job-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

// Parses the pasted JD via jd-parser.ts (one LLM call) — same budget as
// the old job-description route this replaces.
export const maxDuration = 60;

export async function GET() {
  try {
    const recruiterId = await requireRecruiterId();
    return NextResponse.json(await recruiterJobService.listJobs(recruiterId));
  } catch (error) {
    return handleRecruiterRouteError(error, "Failed to load jobs");
  }
}

export async function POST(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    const { title, company, jobDescriptionText } = await req.json();

    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    if (typeof jobDescriptionText !== "string" || !jobDescriptionText.trim()) {
      return NextResponse.json({ error: "jobDescriptionText is required" }, { status: 400 });
    }

    const job = await recruiterJobService.createJob(recruiterId, {
      title,
      company: typeof company === "string" ? company : null,
      jobDescriptionText,
    });

    return NextResponse.json(job);
  } catch (error) {
    return handleRecruiterRouteError(error, "Creating the job failed");
  }
}

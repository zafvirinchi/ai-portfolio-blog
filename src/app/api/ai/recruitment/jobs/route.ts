import { NextResponse } from "next/server";

import { jobService } from "@/lib/ai/recruitment/job-service";
import * as activityService from "@/lib/saas/activity-service";

export async function GET() {
  return NextResponse.json(jobService.list());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (typeof body?.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const job = jobService.create({
      title: body.title.trim(),
      department: body.department ?? null,
      location: body.location ?? null,
      employmentType: body.employmentType,
      experienceRequired: body.experienceRequired ?? null,
      salary: body.salary ?? null,
      requiredSkills: Array.isArray(body.requiredSkills) ? body.requiredSkills : [],
      preferredSkills: Array.isArray(body.preferredSkills) ? body.preferredSkills : [],
      education: Array.isArray(body.education) ? body.education : [],
      noticePeriod: body.noticePeriod ?? null,
      hiringManager: body.hiringManager ?? null,
      recruiter: body.recruiter ?? null,
    });

    await activityService.record("Job Created", `Created job: ${job.title}`, { jobId: job.jobId });

    return NextResponse.json(job);
  } catch (error) {
    console.error("[recruitment] Job creation route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Job creation failed" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";

import { linkedinService } from "@/lib/ai/linkedin/linkedin-service";
import * as activityService from "@/lib/saas/activity-service";

export async function POST(req: Request) {
  try {
    const { resumeId, rewriteId, jdMatchId, careerGoal, targetRole, yearsOfExperience, industry, volunteerWork, publications, patents, licenses } =
      await req.json();

    if (typeof resumeId !== "string" || !resumeId) {
      return NextResponse.json({ error: "resumeId is required" }, { status: 400 });
    }

    const record = linkedinService.start({
      resumeId,
      rewriteId: typeof rewriteId === "string" && rewriteId ? rewriteId : undefined,
      jdMatchId: typeof jdMatchId === "string" && jdMatchId ? jdMatchId : undefined,
      careerGoal: typeof careerGoal === "string" ? careerGoal : undefined,
      targetRole: typeof targetRole === "string" ? targetRole : undefined,
      yearsOfExperience: typeof yearsOfExperience === "number" ? yearsOfExperience : undefined,
      industry: typeof industry === "string" ? industry : undefined,
      volunteerWork: Array.isArray(volunteerWork) ? volunteerWork : undefined,
      publications: Array.isArray(publications) ? publications : undefined,
      patents: Array.isArray(patents) ? patents : undefined,
      licenses: Array.isArray(licenses) ? licenses : undefined,
    });

    await activityService.record("LinkedIn Optimized", `Optimized LinkedIn profile from resume: ${resumeId}`, {
      linkedinId: record.linkedinId,
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("[linkedin] API route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start LinkedIn optimizer" }, { status: 422 });
  }
}

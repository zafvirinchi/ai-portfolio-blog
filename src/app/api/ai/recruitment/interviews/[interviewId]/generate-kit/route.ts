import { NextResponse } from "next/server";

import { interviewScheduler } from "@/lib/ai/recruitment/interview-scheduler";
import { requireRecruiterId, UnauthorizedError } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

export const maxDuration = 60;

type Params = {
  params: Promise<{ interviewId: string }>;
};

// Phase 23 Milestone 5 — genuine cost defect found and fixed. See
// recommendation/route.ts's own comment for the full rationale and its
// noted residual limitation.
export async function POST(_req: Request, { params }: Params) {
  const { interviewId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    await requireFeature(recruiterId, "recruiter.interview");

    const interview = await interviewScheduler.generateInterviewKit(interviewId);
    return NextResponse.json(interview);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[recruitment] Interview kit route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Interview kit generation failed" }, { status: 422 });
  }
}

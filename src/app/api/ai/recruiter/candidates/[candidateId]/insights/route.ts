import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

export const maxDuration = 30;

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();

    // Phase 19 Milestone 3 — genuine bypass found and fixed: this
    // route had no entitlement check despite generating LLM-backed
    // candidate insights. Gated with recruiter.analytics (NONE on
    // Free, UNLIMITED on Pro+) — the closest existing feature for a
    // per-candidate analytical/insight action.
    await requireFeature(recruiterId, "recruiter.analytics");

    const record = await candidateService.generateInsights(candidateId, recruiterId);

    return NextResponse.json(record);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Insights generation failed");
  }
}

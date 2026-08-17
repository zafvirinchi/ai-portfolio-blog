import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    const { candidateIds } = await req.json();

    if (!Array.isArray(candidateIds) || !candidateIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "candidateIds must be an array of strings" }, { status: 400 });
    }

    // Phase 19 Milestone 3 — genuine bypass found and fixed: LLM-backed
    // comparison recommendation had no entitlement check. Gated with
    // recruiter.analytics, same reasoning as the sibling insights route.
    await requireFeature(recruiterId, "recruiter.analytics");

    const result = await candidateService.compare(recruiterId, candidateIds);

    return NextResponse.json(result);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Comparison failed");
  }
}

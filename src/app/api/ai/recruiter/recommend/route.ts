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
    const body = await req.json().catch(() => ({}));
    const topN = typeof body?.topN === "number" && body.topN > 0 ? body.topN : 5;

    // Phase 19 Milestone 3 — genuine bypass found and fixed: LLM-backed
    // top-candidates recommendation had no entitlement check. Gated
    // with recruiter.analytics — recruiter.ranking (the more literal
    // sibling) is never NONE on any plan, so gating with it would be a
    // no-op; this is an LLM-generated narrative recommendation, not a
    // deterministic sort, matching the same analytical-action reasoning
    // as insights/compare above.
    await requireFeature(recruiterId, "recruiter.analytics");

    const result = await candidateService.recommendTopCandidates(recruiterId, topN);

    return NextResponse.json(result);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Recommendation failed");
  }
}

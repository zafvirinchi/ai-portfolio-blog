import { NextResponse } from "next/server";

import { CANDIDATE_STATUSES } from "@/lib/ai/recruiter/candidate-schema";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

// Phase 16 Milestone 5, §10/§24 — shortlist/review/hold/reject a
// selection at once. Reuses candidateService.updateStatus()'s exact
// semantics via bulkUpdateStatus() — never a second status-mutation
// path. The whole operation is rejected (no row written) if any
// candidateId is missing or belongs to another recruiter; never a
// partial batch update.
export async function POST(req: Request) {
  try {
    const recruiterId = await requireRecruiterId();
    const { candidateIds, status, note } = await req.json();

    if (!Array.isArray(candidateIds) || candidateIds.length === 0 || !candidateIds.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "candidateIds must be a non-empty array of strings" }, { status: 400 });
    }

    if (!CANDIDATE_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${CANDIDATE_STATUSES.join(", ")}` }, { status: 400 });
    }

    // Phase 19 Milestone 3 — genuine bulk-bypass found and fixed:
    // the single-candidate status route (Phase 18 M5) gates the
    // "Shortlisted"/"Interview Scheduled" transitions with
    // recruiter.shortlist/recruiter.interview, but this bulk
    // equivalent — reusing the exact same underlying status semantics —
    // had no such check, so a Free-tier recruiter could reach the same
    // restricted transitions simply by using this route instead. Same
    // gate, applied once before the whole batch (never per-candidate,
    // since it's the same single status value for the entire request).
    if (status === "Shortlisted") await requireFeature(recruiterId, "recruiter.shortlist");
    if (status === "Interview Scheduled") await requireFeature(recruiterId, "recruiter.interview");

    const records = await candidateService.bulkUpdateStatus(recruiterId, candidateIds, status, typeof note === "string" ? note : undefined);

    return NextResponse.json({ updated: records });
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Bulk status update failed");
  }
}

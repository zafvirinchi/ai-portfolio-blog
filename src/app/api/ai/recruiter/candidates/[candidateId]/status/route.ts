import { NextResponse } from "next/server";

import { CANDIDATE_STATUSES } from "@/lib/ai/recruiter/candidate-schema";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";
import { requireFeature } from "@/lib/billing/entitlement-service";
import { entitlementErrorResponse } from "@/lib/billing/entitlement-response";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    const { status, note } = await req.json();

    if (!CANDIDATE_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${CANDIDATE_STATUSES.join(", ")}` }, { status: 400 });
    }

    // Phase 18 Milestone 5 — the two status VALUES with their own named
    // registry features (recruiter.shortlist/recruiter.interview, both
    // NONE on Free, UNLIMITED on Pro/Business) are gated at the
    // specific transition; every other status value (Pending Review, On
    // Hold, Offer, Hired, Rejected) has no registry feature of its own
    // and is unaffected.
    if (status === "Shortlisted") await requireFeature(recruiterId, "recruiter.shortlist");
    if (status === "Interview Scheduled") await requireFeature(recruiterId, "recruiter.interview");

    const record = await candidateService.updateStatus(candidateId, recruiterId, status, typeof note === "string" ? note : undefined);

    return NextResponse.json(record);
  } catch (error) {
    const entitlementError = entitlementErrorResponse(error);
    if (entitlementError) return entitlementError;

    return handleRecruiterRouteError(error, "Status update failed");
  }
}

import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    const { noticePeriod, expectedSalary } = await req.json();

    const record = await candidateService.updateRecruiterFields(candidateId, recruiterId, {
      noticePeriod: noticePeriod === undefined ? undefined : typeof noticePeriod === "string" ? noticePeriod : null,
      expectedSalary: expectedSalary === undefined ? undefined : typeof expectedSalary === "string" ? expectedSalary : null,
    });

    return NextResponse.json(record);
  } catch (error) {
    return handleRecruiterRouteError(error, "Fields update failed");
  }
}

import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const { noticePeriod, expectedSalary } = await req.json();

    const record = candidateService.updateRecruiterFields(candidateId, {
      noticePeriod: noticePeriod === undefined ? undefined : typeof noticePeriod === "string" ? noticePeriod : null,
      expectedSalary: expectedSalary === undefined ? undefined : typeof expectedSalary === "string" ? expectedSalary : null,
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("[recruiter] Fields update route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Fields update failed" }, { status: 422 });
  }
}

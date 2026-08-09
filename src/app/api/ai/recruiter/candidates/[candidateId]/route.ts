import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { candidateId } = await params;
  const profile = candidateService.getProfile(candidateId);

  if (!profile) {
    return NextResponse.json({ error: "Candidate not found or their resume has expired" }, { status: 404 });
  }

  return NextResponse.json(profile);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { candidateId } = await params;
  candidateService.remove(candidateId);

  return NextResponse.json({ removed: true });
}

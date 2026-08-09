import { NextResponse } from "next/server";

import { candidateService } from "@/lib/ai/recruiter/candidate-service";

export async function GET() {
  return NextResponse.json(candidateService.list());
}

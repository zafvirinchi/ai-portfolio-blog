import { NextResponse } from "next/server";

import { offerService } from "@/lib/ai/recruitment/offer-service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") ?? undefined;
  const pipelineCandidateId = url.searchParams.get("pipelineCandidateId") ?? undefined;

  return NextResponse.json(offerService.list({ jobId, pipelineCandidateId }));
}

export async function POST(req: Request) {
  try {
    const { pipelineCandidateId, salary, startDate, expiryDate } = await req.json();

    if (typeof pipelineCandidateId !== "string" || !pipelineCandidateId) {
      return NextResponse.json({ error: "pipelineCandidateId is required" }, { status: 400 });
    }

    const offer = await offerService.create({
      pipelineCandidateId,
      salary: salary ?? null,
      startDate: startDate ?? null,
      expiryDate: expiryDate ?? null,
    });

    return NextResponse.json(offer);
  } catch (error) {
    console.error("[recruitment] Offer creation route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Offer creation failed" }, { status: 422 });
  }
}

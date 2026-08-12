import { NextResponse } from "next/server";

import { NOTE_CATEGORIES } from "@/lib/ai/recruiter/candidate-schema";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";
import { handleRecruiterRouteError } from "@/lib/ai/recruiter/recruiter-route-helpers";
import { requireRecruiterId } from "@/lib/ai/recruiter/recruiter-auth";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const recruiterId = await requireRecruiterId();
    const { category, text } = await req.json();

    if (!NOTE_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: `category must be one of: ${NOTE_CATEGORIES.join(", ")}` }, { status: 400 });
    }

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const record = await candidateService.addNote(candidateId, recruiterId, category, text.trim());

    return NextResponse.json(record);
  } catch (error) {
    return handleRecruiterRouteError(error, "Adding note failed");
  }
}

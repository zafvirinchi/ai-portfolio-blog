import { NextResponse } from "next/server";

import { NOTE_CATEGORIES } from "@/lib/ai/recruiter/candidate-schema";
import { candidateService } from "@/lib/ai/recruiter/candidate-service";

type Params = {
  params: Promise<{ candidateId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { candidateId } = await params;

  try {
    const { category, text } = await req.json();

    if (!NOTE_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: `category must be one of: ${NOTE_CATEGORIES.join(", ")}` }, { status: 400 });
    }

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const record = candidateService.addNote(candidateId, category, text.trim());

    return NextResponse.json(record);
  } catch (error) {
    console.error("[recruiter] Add note route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Adding note failed" }, { status: 422 });
  }
}

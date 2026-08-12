import { NextResponse } from "next/server";

import { requireUserId, addSectionSchema, resumeVersionService } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

type Params = { params: Promise<{ id: string }> };

// Adds a section of a registry-validated type (addSectionSchema's
// z.enum(SECTION_TYPES) rejects anything else with a 400) — allowed on
// the Master Resume, since this is an explicit, non-AI user edit.
export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = addSectionSchema.parse(await req.json());

    const version = await resumeVersionService.addSection(userId, id, body.type, body.title);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to add section");
  }
}

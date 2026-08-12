import { NextResponse } from "next/server";

import { requireUserId, addEntrySchema, resumeVersionService } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

type Params = { params: Promise<{ id: string; sectionId: string }> };

// No fixed maximum entry count — the service simply appends.
export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, sectionId } = await params;
    const body = addEntrySchema.parse(await req.json().catch(() => ({})));

    const version = await resumeVersionService.addEntry(userId, id, sectionId, body.fields);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to add entry");
  }
}

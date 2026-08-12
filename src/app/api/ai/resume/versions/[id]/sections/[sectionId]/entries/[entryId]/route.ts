import { NextResponse } from "next/server";

import { requireUserId, updateEntrySchema, resumeVersionService } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

type Params = { params: Promise<{ id: string; sectionId: string; entryId: string }> };

// Field edits (Edit Entry), visibility toggle, and per-field
// hiddenFieldKeys all go through this one PATCH — the client debounces/
// batches these (e.g. commits on blur, not per keystroke) rather than
// this route imposing its own rate limiting.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, sectionId, entryId } = await params;
    const body = updateEntrySchema.parse(await req.json());

    const version = await resumeVersionService.updateEntry(userId, id, sectionId, entryId, body);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to update entry");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, sectionId, entryId } = await params;

    const version = await resumeVersionService.removeEntry(userId, id, sectionId, entryId);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to delete entry");
  }
}

import { NextResponse } from "next/server";

import { requireUserId, updateSectionSchema, resumeVersionService } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

type Params = { params: Promise<{ id: string; sectionId: string }> };

// Rename and/or hide/show — deterministic, allowed on the master.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, sectionId } = await params;
    const body = updateSectionSchema.parse(await req.json());

    const version = await resumeVersionService.updateSection(userId, id, sectionId, body);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to update section");
  }
}

// Deletes the section entirely (distinct from hiding it via PATCH
// {visible:false}) — the client confirms this destructive action
// before calling it (per the milestone's "deleting a section must
// require confirmation" rule), enforced in the UI, not re-confirmed
// server-side.
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, sectionId } = await params;

    const version = await resumeVersionService.removeSection(userId, id, sectionId);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to delete section");
  }
}

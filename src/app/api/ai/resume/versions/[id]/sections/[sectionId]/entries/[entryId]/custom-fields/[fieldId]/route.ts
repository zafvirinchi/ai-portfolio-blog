import { NextResponse } from "next/server";

import { requireUserId, updateCustomFieldSchema, resumeVersionService } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

type Params = { params: Promise<{ id: string; sectionId: string; entryId: string; fieldId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, sectionId, entryId, fieldId } = await params;
    const body = updateCustomFieldSchema.parse(await req.json());

    const version = await resumeVersionService.updateCustomField(userId, id, sectionId, entryId, fieldId, body);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to update custom field");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, sectionId, entryId, fieldId } = await params;

    const version = await resumeVersionService.removeCustomField(userId, id, sectionId, entryId, fieldId);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to remove custom field");
  }
}

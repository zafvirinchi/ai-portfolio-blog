import { NextResponse } from "next/server";

import { requireUserId, addCustomFieldSchema, resumeVersionService } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

type Params = { params: Promise<{ id: string; sectionId: string; entryId: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, sectionId, entryId } = await params;
    const body = addCustomFieldSchema.parse(await req.json());

    const version = await resumeVersionService.addCustomField(userId, id, sectionId, entryId, body.label, body.value);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to add custom field");
  }
}

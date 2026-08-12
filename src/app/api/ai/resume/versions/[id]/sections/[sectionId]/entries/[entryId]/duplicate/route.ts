import { NextResponse } from "next/server";

import { requireUserId, resumeVersionService } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

type Params = { params: Promise<{ id: string; sectionId: string; entryId: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, sectionId, entryId } = await params;

    const version = await resumeVersionService.duplicateEntry(userId, id, sectionId, entryId);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to duplicate entry");
  }
}

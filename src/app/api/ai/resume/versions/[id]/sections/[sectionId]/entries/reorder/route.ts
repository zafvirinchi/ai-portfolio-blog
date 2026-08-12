import { NextResponse } from "next/server";

import { requireUserId, reorderEntriesSchema, resumeVersionService } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

type Params = { params: Promise<{ id: string; sectionId: string }> };

// The generated resume follows exactly this order — never
// auto-sorted unless the user explicitly requests it.
export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, sectionId } = await params;
    const body = reorderEntriesSchema.parse(await req.json());

    const version = await resumeVersionService.reorderEntries(userId, id, sectionId, body.orderedEntryIds);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to reorder entries");
  }
}

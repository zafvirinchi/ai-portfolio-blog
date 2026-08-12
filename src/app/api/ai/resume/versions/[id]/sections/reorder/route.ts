import { NextResponse } from "next/server";

import { requireUserId, reorderSectionsSchema, resumeVersionService } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = reorderSectionsSchema.parse(await req.json());

    const version = await resumeVersionService.reorderSections(userId, id, body.orderedSectionIds);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to reorder sections");
  }
}

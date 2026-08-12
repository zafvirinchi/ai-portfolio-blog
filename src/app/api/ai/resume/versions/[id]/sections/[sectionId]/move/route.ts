import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserId, resumeVersionService } from "@/lib/ai/resume-versions";
import { handleVersionRouteError } from "@/lib/ai/resume-versions/resume-version-route-helpers";

const moveSchema = z.object({ direction: z.enum(["up", "down"]) });

type Params = { params: Promise<{ id: string; sectionId: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id, sectionId } = await params;
    const { direction } = moveSchema.parse(await req.json());

    const version = direction === "up" ? await resumeVersionService.moveSectionUp(userId, id, sectionId) : await resumeVersionService.moveSectionDown(userId, id, sectionId);

    return NextResponse.json({ version });
  } catch (error) {
    return handleVersionRouteError(error, "Failed to move section");
  }
}

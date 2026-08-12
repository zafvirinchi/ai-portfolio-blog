import { NextResponse } from "next/server";

import { requireUserId, resumeVersionService, ResumeVersionNotFoundError, UnauthorizedError } from "@/lib/ai/resume-versions";

const LOG_PREFIX = "[resume-version]";

type Params = { params: Promise<{ id: string }> };

// Promotes this version to Master; the previous Master is demoted
// (never archived — it stays fully visible in history). Deterministic,
// no AI call.
export async function POST(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const version = await resumeVersionService.restoreAsMaster(userId, id);

    return NextResponse.json({ version });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ResumeVersionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error(`${LOG_PREFIX} Restore failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to restore this version as master" }, { status: 422 });
  }
}

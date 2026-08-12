import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireUserId, duplicateVersionSchema, resumeVersionService, ResumeVersionNotFoundError, UnauthorizedError } from "@/lib/ai/resume-versions";

const LOG_PREFIX = "[resume-version]";

type Params = { params: Promise<{ id: string }> };

// Deterministic copy — no AI call, no resume re-parsing.
export async function POST(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = duplicateVersionSchema.parse(await req.json().catch(() => ({})));

    const version = await resumeVersionService.duplicateVersion(userId, id, body.versionName);

    return NextResponse.json({ version });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (error instanceof ResumeVersionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error(`${LOG_PREFIX} Duplication failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to duplicate resume version" }, { status: 422 });
  }
}

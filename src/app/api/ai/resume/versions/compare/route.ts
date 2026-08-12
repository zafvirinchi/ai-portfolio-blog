import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireUserId, compareVersionsSchema, resumeVersionService, ResumeVersionNotFoundError, UnauthorizedError } from "@/lib/ai/resume-versions";

const LOG_PREFIX = "[resume-version]";

// Pure, deterministic diff of two already-persisted versions — no AI call.
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = compareVersionsSchema.parse(await req.json());

    const comparison = await resumeVersionService.compareVersions(userId, body.versionAId, body.versionBId);

    return NextResponse.json({ comparison });
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

    console.error(`${LOG_PREFIX} Comparison failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to compare resume versions" }, { status: 422 });
  }
}

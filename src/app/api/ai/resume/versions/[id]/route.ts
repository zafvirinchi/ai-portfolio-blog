import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireUserId, updateVersionSchema, resumeVersionService, ResumeVersionNotFoundError, MasterResumeProtectedError, UnauthorizedError } from "@/lib/ai/resume-versions";

const LOG_PREFIX = "[resume-version]";

type Params = { params: Promise<{ id: string }> };

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (error instanceof ResumeVersionNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof MasterResumeProtectedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  console.error(`${LOG_PREFIX} Operation failed`, error instanceof Error ? error.message : error);
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 422 });
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const version = await resumeVersionService.getVersion(userId, id);

    return NextResponse.json({ version });
  } catch (error) {
    return errorResponse(error, "Failed to load resume version");
  }
}

// Rename and/or update target role/company/location — deterministic,
// no AI call, and (unlike optimize/rewrite) explicitly ALLOWED on the
// Master Resume, since it never touches resume_data.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = updateVersionSchema.parse(await req.json());

    let version = await resumeVersionService.getVersion(userId, id);

    if (body.versionName) {
      version = await resumeVersionService.renameVersion(userId, id, body.versionName);
    }

    if (body.targetJobTitle !== undefined || body.targetCompany !== undefined || body.targetLocation !== undefined) {
      version = await resumeVersionService.updateMetadata(userId, id, body);
    }

    return NextResponse.json({ version });
  } catch (error) {
    return errorResponse(error, "Failed to update resume version");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await resumeVersionService.deleteVersion(userId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Failed to delete resume version");
  }
}

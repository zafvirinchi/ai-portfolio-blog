import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ResumeVersionNotFoundError, MasterResumeProtectedError } from "./resume-version-service";
import {
  SectionNotFoundError,
  EntryNotFoundError,
  CustomFieldNotFoundError,
  DuplicateSingletonSectionError,
  UnknownFieldError,
  InvalidFieldValueError,
  InvalidOrderError,
} from "./dynamic/dynamic-resume-document-service";
import { UnauthorizedError } from "./resume-version-auth";

const LOG_PREFIX = "[resume-version]";

/**
 * Shared by every /api/ai/resume/versions/[id]/sections* route — the
 * Dynamic Resume Builder's structural-edit surface has ~10 route
 * files (add/update/remove/reorder/move section, add/update/remove/
 * reorder/duplicate entry, add/update/remove custom field), all of
 * which need to map the exact same handful of error types to the same
 * HTTP statuses. Keeping that mapping in one place means a route can
 * never drift into returning the wrong status for e.g. a not-found
 * section vs. a not-found entry.
 */
export function handleVersionRouteError(error: unknown, fallback: string): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (error instanceof UnknownFieldError || error instanceof InvalidFieldValueError || error instanceof InvalidOrderError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof ResumeVersionNotFoundError || error instanceof SectionNotFoundError || error instanceof EntryNotFoundError || error instanceof CustomFieldNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof MasterResumeProtectedError || error instanceof DuplicateSingletonSectionError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  console.error(`${LOG_PREFIX} Operation failed`, error instanceof Error ? error.message : error);
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 422 });
}

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { CandidateNotFoundError } from "./candidate-service";
import { RecruiterJobNotFoundError } from "./recruiter-job-service";
import { UnauthorizedError } from "./recruiter-auth";

const LOG_PREFIX = "[recruiter]";

/**
 * Shared by every /api/ai/recruiter* route (17 files) — one place
 * mapping the ownership/auth error types every route now has to
 * handle to the same HTTP statuses, mirroring resume-version-
 * route-helpers.ts's handleVersionRouteError(). CandidateNotFoundError
 * is deliberately mapped to 404 for BOTH "doesn't exist" and "exists
 * but belongs to another recruiter" — never a distinct 403 — so a
 * response never leaks whether a candidateId exists at all (§14).
 */
export function handleRecruiterRouteError(error: unknown, fallback: string, fallbackStatus = 422): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof CandidateNotFoundError || error instanceof RecruiterJobNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  console.error(`${LOG_PREFIX} Operation failed`, error instanceof Error ? error.message : error);
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: fallbackStatus });
}

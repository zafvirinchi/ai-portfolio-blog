import { NextResponse } from "next/server";

import { AdminAccessRequiredError, PlatformUnauthorizedError, requirePlatformAdmin } from "./persona-service";

export type AdminGuardResult = { ok: true; userId: string; email: string | null } | { ok: false; response: NextResponse };

/**
 * Phase 18 Milestone 4, Step 7 — shared guard for /api/admin/** route
 * handlers outside src/app/api/admin/platform/**. That area already
 * calls requirePlatformAdmin() directly (Phase 18 M3); this file exists
 * because the audit for this milestone found every OTHER /api/admin/**
 * route either had no auth check at all (blogs, interview-*, knowledge,
 * rag-documents — all writing via the service-role client) or a local
 * requireAdmin() that only verified a session existed, never a role
 * (the 10 analytics/* routes). Wraps the same requirePlatformAdmin()
 * every admin route already relies on — never a second role-resolution
 * implementation, just one place to map its errors to a Response.
 */
export async function requireAdminRoute(): Promise<AdminGuardResult> {
  try {
    const { userId, email } = await requirePlatformAdmin();
    return { ok: true, userId, email };
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) {
      return { ok: false, response: NextResponse.json({ error: error.message }, { status: 401 }) };
    }

    if (error instanceof AdminAccessRequiredError) {
      return { ok: false, response: NextResponse.json({ error: error.message }, { status: 403 }) };
    }

    console.error("[admin-api-guard] Authorization check failed", error);
    return { ok: false, response: NextResponse.json({ error: "Authorization check failed" }, { status: 500 }) };
  }
}

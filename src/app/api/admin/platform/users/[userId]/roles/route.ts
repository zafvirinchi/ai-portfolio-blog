import { NextResponse } from "next/server";

import { assignPlatformRole, mapPlatformAdminError, removePlatformRole } from "@/lib/billing/platform-admin-service";
import { AdminAccessRequiredError, PlatformUnauthorizedError, requirePlatformAdmin } from "@/lib/billing/persona-service";

// Phase 18 Milestone 3 — Scope B. The client supplies only `role` and
// `action` (assign|remove) — never a full app_metadata payload, never
// the acting admin's identity. targetUserId comes from the URL path,
// resolved and existence-checked server-side
// (assignPlatformRole()/removePlatformRole() -> UserNotFoundError). All
// safety guards (last-admin block, self-lockout confirmation) live in
// platform-admin-service.ts, not here.
export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId: actingAdminUserId } = await requirePlatformAdmin();
    const { userId: targetUserId } = await params;

    const body = await req.json();
    const role = typeof body?.role === "string" ? body.role : "";
    const action = body?.action === "remove" ? "remove" : "assign";
    const confirmSelfRemoval = body?.confirmSelfRemoval === true;

    const roles =
      action === "remove"
        ? await removePlatformRole(req, actingAdminUserId, targetUserId, role, { confirmSelfRemoval })
        : await assignPlatformRole(req, actingAdminUserId, targetUserId, role);

    return NextResponse.json({ userId: targetUserId, roles });
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof AdminAccessRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    const { status, message } = mapPlatformAdminError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

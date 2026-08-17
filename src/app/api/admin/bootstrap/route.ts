import { NextResponse } from "next/server";

import { BootstrapNotConfiguredError, BootstrapSecretInvalidError, BootstrapUserNotFoundError, bootstrapPlatformAdmin, hasAnyBootstrapGrant } from "@/lib/billing/platform-admin-bootstrap-service";
import { PlatformUnauthorizedError, requireUserId } from "@/lib/billing/persona-service";

// Phase 18 Milestone 4 — establishes the FIRST admin. Deliberately NOT
// under /api/admin/platform/** (that whole tree is admin-only, see
// admin-api-guard.ts / requirePlatformAdmin() — a caller who isn't
// admin yet, by definition, could never reach it). This route requires
// its own two independent factors instead: a real, specific
// authenticated session (requireUserId()) AND the server-only
// PLATFORM_ADMIN_BOOTSTRAP_SECRET. It can only ever grant ADMIN to the
// CALLER'S OWN account — no targetUserId is ever accepted from the
// request, so this can't be used to promote anyone else and can't
// become a general role-assignment API (that's what
// /api/admin/platform/users/[userId]/roles is for, correctly requiring
// an EXISTING admin). See platform-admin-bootstrap-service.ts for the
// full design rationale.
export async function POST(req: Request) {
  try {
    const { userId } = await requireUserId();
    const secret = req.headers.get("x-bootstrap-secret");

    const priorGrantExisted = await hasAnyBootstrapGrant();
    const result = await bootstrapPlatformAdmin(req, userId, secret);

    // Never echoes the secret, never returns anything beyond the
    // caller's own resulting role state.
    return NextResponse.json({
      userId: result.userId,
      roles: result.roles,
      alreadyAdmin: result.alreadyAdmin,
      priorGrantExisted,
    });
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof BootstrapSecretInvalidError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (error instanceof BootstrapUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof BootstrapNotConfiguredError) {
      // Fails closed without revealing whether the secret itself would
      // have been correct — a missing server config is indistinguishable
      // from "not deployed here" to an outside caller.
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("[admin/bootstrap] Bootstrap route failed", error);
    return NextResponse.json({ error: "Bootstrap failed." }, { status: 500 });
  }
}

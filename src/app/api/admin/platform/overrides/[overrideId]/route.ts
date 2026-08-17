import { NextResponse } from "next/server";

import { deactivateOverrideByAdmin, mapPlatformAdminError } from "@/lib/billing/platform-admin-service";
import { AdminAccessRequiredError, PlatformUnauthorizedError, requirePlatformAdmin } from "@/lib/billing/persona-service";

// Phase 18 Milestone 3 — Scope C ("remove an override"). Which user this
// override belongs to is resolved server-side from the override row
// itself (platform-admin-service.ts's getOverrideById()), never
// accepted from the client — a client cannot deactivate an override
// under a false target-user claim, because no target user is ever
// accepted as input here at all.
export async function DELETE(req: Request, { params }: { params: Promise<{ overrideId: string }> }) {
  try {
    const { userId: actingAdminUserId } = await requirePlatformAdmin();
    const { overrideId } = await params;

    await deactivateOverrideByAdmin(req, actingAdminUserId, overrideId);
    return NextResponse.json({ deactivated: true });
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

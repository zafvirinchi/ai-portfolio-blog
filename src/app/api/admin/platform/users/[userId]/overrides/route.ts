import { NextResponse } from "next/server";

import { grantOverrideByAdmin, mapPlatformAdminError, revokeOverrideByAdmin } from "@/lib/billing/platform-admin-service";
import { AdminAccessRequiredError, PlatformUnauthorizedError, requirePlatformAdmin } from "@/lib/billing/persona-service";

// Phase 18 Milestone 3 — Scope C. featureId is validated against the
// central 24-feature registry (grantOverrideByAdmin()/revokeOverrideByAdmin()
// -> InvalidFeatureIdError) before anything is written. The actual
// GRANTED/REVOKED decision and its own admin-authorization check still
// live entirely in entitlement-service.ts (M1) — this route only
// resolves the acting admin's identity and forwards the request.
export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId: actingAdminUserId } = await requirePlatformAdmin();
    const { userId: targetUserId } = await params;

    const body = await req.json();
    const featureId = typeof body?.featureId === "string" ? body.featureId : "";
    const access = body?.access === "REVOKED" ? "REVOKED" : "GRANTED";
    const reason = typeof body?.reason === "string" ? body.reason : undefined;
    const expiresAt = typeof body?.expiresAt === "string" ? body.expiresAt : undefined;

    const override =
      access === "REVOKED"
        ? await revokeOverrideByAdmin(req, actingAdminUserId, targetUserId, featureId, { reason, expiresAt })
        : await grantOverrideByAdmin(req, actingAdminUserId, targetUserId, featureId, { reason, expiresAt });

    return NextResponse.json(override);
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

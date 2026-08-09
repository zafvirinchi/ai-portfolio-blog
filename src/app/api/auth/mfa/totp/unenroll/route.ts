import { NextResponse } from "next/server";

import * as auditAuth from "@/lib/auth/audit-auth";
import { mfaTotpUnenrollSchema } from "@/lib/auth/auth-schema";
import { unenrollTotp } from "@/lib/auth/mfa-service";
import { requireAuthContext } from "@/lib/auth/permission-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const context = await requireAuthContext();
    const body = mfaTotpUnenrollSchema.parse(await req.json());

    const supabase = await createSupabaseRouteClient();
    await unenrollTotp(supabase, body.factorId);

    await auditAuth.record(req, { action: "MFA Disabled", userId: context.userId, objectType: "totp_factor", objectId: body.factorId });
    console.log("[auth] MFA Disabled", { userId: context.userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth] MFA TOTP unenroll route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Unenroll failed" }, { status: 422 });
  }
}

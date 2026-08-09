import { NextResponse } from "next/server";

import * as auditAuth from "@/lib/auth/audit-auth";
import { mfaTotpVerifySchema } from "@/lib/auth/auth-schema";
import { finalizeLogin } from "@/lib/auth/auth-service";
import { challengeTotp, generateBackupCodes, issueTrustedDevice, TRUSTED_DEVICE_COOKIE_NAME, TRUSTED_DEVICE_MAX_AGE_SECONDS, verifyTotp } from "@/lib/auth/mfa-service";
import { extractIp, extractUserAgent } from "@/lib/auth/security-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const body = mfaTotpVerifySchema.parse(await req.json());

    const supabase = await createSupabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const challengeId = body.challengeId ?? (await challengeTotp(supabase, body.factorId));
    await verifyTotp(supabase, body.factorId, challengeId, body.code);

    let backupCodes: string[] | undefined;

    if (body.context === "enroll") {
      backupCodes = await generateBackupCodes(user.id);
      await auditAuth.record(req, { action: "MFA Enabled", userId: user.id, objectType: "totp_factor", objectId: body.factorId });
      console.log("[auth] MFA Enabled", { userId: user.id });
    } else {
      await finalizeLogin(req, user.id);
    }

    const response = NextResponse.json({ success: true, backupCodes });

    if (body.trustDevice) {
      const token = await issueTrustedDevice(user.id, extractIp(req), extractUserAgent(req));
      response.cookies.set(TRUSTED_DEVICE_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
      });
    }

    return response;
  } catch (error) {
    console.error("[auth] MFA TOTP verify route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Verification failed" }, { status: 422 });
  }
}

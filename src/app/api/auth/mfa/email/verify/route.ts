import { NextResponse } from "next/server";

import { mfaEmailVerifySchema } from "@/lib/auth/auth-schema";
import { finalizeLogin } from "@/lib/auth/auth-service";
import { issueTrustedDevice, TRUSTED_DEVICE_COOKIE_NAME, TRUSTED_DEVICE_MAX_AGE_SECONDS, verifyEmailChallenge } from "@/lib/auth/mfa-service";
import { extractIp, extractUserAgent } from "@/lib/auth/security-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const body = mfaEmailVerifySchema.parse(await req.json());

    const supabase = await createSupabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const valid = await verifyEmailChallenge(body.challengeId, body.code);

    if (!valid) {
      return NextResponse.json({ error: "That code is invalid or has expired." }, { status: 422 });
    }

    await finalizeLogin(req, user.id);

    const response = NextResponse.json({ success: true });

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
    console.error("[auth] MFA email verify route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Verification failed" }, { status: 422 });
  }
}

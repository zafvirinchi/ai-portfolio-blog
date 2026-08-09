import { NextResponse } from "next/server";

import { LOCKOUT_POLICY } from "@/lib/auth/auth-schema";
import { sendEmailChallenge } from "@/lib/auth/mfa-service";
import { checkAndRecordRequestLimit } from "@/lib/auth/security-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

// Used mid-login (after password success, before finalizeLogin) as a
// fallback second factor — resolves the pending user from the
// already-established aal1 Supabase session, no body needed.
export async function POST() {
  try {
    const supabase = await createSupabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const limit = await checkAndRecordRequestLimit("otp_request", user.id, LOCKOUT_POLICY.maxOtpRequests, LOCKOUT_POLICY.otpWindowMinutes);

    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many code requests. Try again later." }, { status: 429 });
    }

    const result = await sendEmailChallenge(user.id, user.email ?? null);

    return NextResponse.json({ challengeId: result.challengeId, expiresAt: result.expiresAt });
  } catch (error) {
    console.error("[auth] MFA email send route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to send code" }, { status: 422 });
  }
}

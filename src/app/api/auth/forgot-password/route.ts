import { NextResponse } from "next/server";

import { forgotPasswordSchema, LOCKOUT_POLICY } from "@/lib/auth/auth-schema";
import { checkAndRecordRequestLimit } from "@/lib/auth/security-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const body = forgotPasswordSchema.parse(await req.json());

    const limit = await checkAndRecordRequestLimit(
      "password_reset_request",
      body.email,
      LOCKOUT_POLICY.maxPasswordResetRequests,
      LOCKOUT_POLICY.passwordResetWindowMinutes
    );

    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many password reset requests. Try again later." }, { status: 429 });
    }

    const supabase = await createSupabaseRouteClient();
    const origin = new URL(req.url).origin;

    // Errors are intentionally swallowed below (never reveal whether an
    // email is registered) — same anti-enumeration posture as most auth
    // systems' forgot-password endpoints.
    await supabase.auth.resetPasswordForEmail(body.email, {
      redirectTo: `${origin}/auth/callback?redirect=/reset-password`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth] Forgot-password route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 422 });
  }
}

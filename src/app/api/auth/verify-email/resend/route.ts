import { NextResponse } from "next/server";

import { resendVerificationSchema, LOCKOUT_POLICY } from "@/lib/auth/auth-schema";
import { resendVerification } from "@/lib/auth/auth-service";
import { checkAndRecordRequestLimit } from "@/lib/auth/security-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const body = resendVerificationSchema.parse(await req.json());

    const limit = await checkAndRecordRequestLimit("otp_request", body.email, LOCKOUT_POLICY.maxOtpRequests, LOCKOUT_POLICY.otpWindowMinutes);

    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    const supabase = await createSupabaseRouteClient();
    await resendVerification(supabase, body.email);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth] Resend-verification route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Resend failed" }, { status: 422 });
  }
}

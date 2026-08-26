import { NextResponse } from "next/server";

import * as auditAuth from "@/lib/auth/audit-auth";
import { resetPasswordSchema } from "@/lib/auth/auth-schema";
import { checkHistory, recordPasswordChange } from "@/lib/auth/password-service";
import * as sessionService from "@/lib/auth/session-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";
import { resolveDefaultLandingPath } from "@/lib/billing/persona-service";

export async function POST(req: Request) {
  try {
    const body = resetPasswordSchema.parse(await req.json());

    const supabase = await createSupabaseRouteClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Your password reset link has expired. Request a new one." }, { status: 401 });
    }

    await checkHistory(user.id, body.newPassword);

    const { error } = await supabase.auth.updateUser({ password: body.newPassword });

    if (error) {
      throw new Error(error.message);
    }

    await recordPasswordChange(user.id, body.newPassword);

    // A password reset is a strong signal to invalidate every other
    // session — the same "logout all other devices" real Supabase scope
    // used elsewhere in this milestone.
    await supabase.auth.signOut({ scope: "others" });
    await sessionService.revokeOthers(user.id, null);

    await auditAuth.record(req, { action: "Password Changed", userId: user.id });
    console.log("[auth] Password Changed", { userId: user.id, via: "reset" });

    // Phase 23 Milestone 5 — genuine defect found and fixed: this
    // completion path never computed a persona-aware landing path, so an
    // existing RECRUITER resetting a forgotten password always landed on
    // /resume-analyzer, diverging from every other completion path
    // wired through finalizeLogin()/resolveDefaultLandingPath().
    const defaultLandingPath = await resolveDefaultLandingPath(user.id);

    return NextResponse.json({ success: true, defaultLandingPath });
  } catch (error) {
    console.error("[auth] Reset-password route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Reset failed" }, { status: 422 });
  }
}

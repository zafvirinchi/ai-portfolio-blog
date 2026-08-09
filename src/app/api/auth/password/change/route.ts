import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import * as auditAuth from "@/lib/auth/audit-auth";
import { changePasswordSchema } from "@/lib/auth/auth-schema";
import { checkHistory, recordPasswordChange } from "@/lib/auth/password-service";
import { requireAuthContext } from "@/lib/auth/permission-service";
import { AUTH_SESSION_COOKIE_NAME } from "@/lib/auth/session-service";
import * as sessionService from "@/lib/auth/session-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const context = await requireAuthContext();
    const body = changePasswordSchema.parse(await req.json());

    const supabase = await createSupabaseRouteClient();

    // Verify the current password before allowing the change.
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: context.email ?? "", password: body.currentPassword });

    if (verifyError) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    await checkHistory(context.userId, body.newPassword);

    const { error } = await supabase.auth.updateUser({ password: body.newPassword });

    if (error) {
      throw new Error(error.message);
    }

    await recordPasswordChange(context.userId, body.newPassword);

    const cookieStore = await cookies();
    const currentSessionId = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value ?? null;

    await supabase.auth.signOut({ scope: "others" });
    await sessionService.revokeOthers(context.userId, currentSessionId);

    await auditAuth.record(req, { action: "Password Changed", userId: context.userId });
    console.log("[auth] Password Changed", { userId: context.userId, via: "settings" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth] Password change route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Password change failed" }, { status: 422 });
  }
}

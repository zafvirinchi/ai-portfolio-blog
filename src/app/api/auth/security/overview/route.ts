import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { AUTH_SESSION_COOKIE_NAME, list as listSessions } from "@/lib/auth/session-service";
import { requireAuthContext } from "@/lib/auth/permission-service";

export async function GET() {
  try {
    const context = await requireAuthContext();
    const cookieStore = await cookies();
    const currentSessionId = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value ?? null;

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [recentLogins, { data: alerts }, { count: failedLoginAttempts24h }] = await Promise.all([
      listSessions(context.userId, currentSessionId),
      supabaseAdmin.from("security_alerts").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(20),
      context.email
        ? supabaseAdmin
            .from("security_events")
            .select("id", { count: "exact", head: true })
            .eq("event_type", "login_attempt")
            .eq("key", context.email)
            .eq("success", false)
            .gte("created_at", since24h)
        : Promise.resolve({ count: 0 }),
    ]);

    return NextResponse.json({
      recentLogins: recentLogins.slice(0, 10),
      alerts: alerts ?? [],
      failedLoginAttempts24h: failedLoginAttempts24h ?? 0,
    });
  } catch (error) {
    console.error("[auth] Security overview route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load security overview" }, { status: 422 });
  }
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_SESSION_COOKIE_NAME, list } from "@/lib/auth/session-service";
import { requireAuthContext } from "@/lib/auth/permission-service";

export async function GET() {
  try {
    const context = await requireAuthContext();
    const cookieStore = await cookies();
    const currentSessionId = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value ?? null;

    const sessions = await list(context.userId, currentSessionId);

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("[auth] Sessions list route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load sessions" }, { status: 422 });
  }
}

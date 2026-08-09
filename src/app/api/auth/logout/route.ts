import { NextResponse } from "next/server";

import { logout } from "@/lib/auth/auth-service";
import { logoutSchema } from "@/lib/auth/auth-schema";

export async function POST(req: Request) {
  try {
    const body = logoutSchema.parse(await req.json().catch(() => ({})));
    await logout(req, body.scope);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth] Logout route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Logout failed" }, { status: 422 });
  }
}

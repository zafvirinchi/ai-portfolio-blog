import { NextResponse } from "next/server";

import { logout } from "@/lib/auth/auth-service";

export async function POST(req: Request) {
  try {
    await logout(req, "others");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth] Revoke-others route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Revoke failed" }, { status: 422 });
  }
}

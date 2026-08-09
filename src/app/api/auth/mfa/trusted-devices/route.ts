import { NextResponse } from "next/server";

import { listTrustedDevices } from "@/lib/auth/mfa-service";
import { requireAuthContext } from "@/lib/auth/permission-service";

export async function GET() {
  try {
    const context = await requireAuthContext();
    const devices = await listTrustedDevices(context.userId);

    return NextResponse.json(devices);
  } catch (error) {
    console.error("[auth] Trusted devices list route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load trusted devices" }, { status: 422 });
  }
}

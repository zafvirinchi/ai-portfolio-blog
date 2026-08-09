import { NextResponse } from "next/server";

import * as auditAuth from "@/lib/auth/audit-auth";
import { generateBackupCodes } from "@/lib/auth/mfa-service";
import { requireAuthContext } from "@/lib/auth/permission-service";

export async function POST(req: Request) {
  try {
    const context = await requireAuthContext();
    const codes = await generateBackupCodes(context.userId);

    await auditAuth.record(req, { action: "Backup Codes Regenerated", userId: context.userId });

    return NextResponse.json({ codes });
  } catch (error) {
    console.error("[auth] Backup codes generate route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Generation failed" }, { status: 422 });
  }
}

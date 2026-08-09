import { NextResponse } from "next/server";

import * as auditAuth from "@/lib/auth/audit-auth";
import { revokeTrustedDevice } from "@/lib/auth/mfa-service";
import { requireAuthContext } from "@/lib/auth/permission-service";

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const context = await requireAuthContext();

    await revokeTrustedDevice(context.userId, id);
    await auditAuth.record(req, { action: "Trusted Device Revoked", userId: context.userId, objectType: "trusted_device", objectId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth] Trusted device revoke route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Revoke failed" }, { status: 422 });
  }
}

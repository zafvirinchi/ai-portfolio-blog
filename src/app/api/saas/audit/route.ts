import { NextResponse } from "next/server";

import * as auditService from "@/lib/saas/audit-service";
import { requirePermission } from "@/lib/saas/permission-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

export async function GET() {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json({ error: "Not authenticated, or no active organization membership" }, { status: 401 });
  }

  try {
    requirePermission(context, "Manage Users");
  } catch {
    return NextResponse.json({ error: "Missing required permission: Manage Users" }, { status: 403 });
  }

  const audit = await auditService.list(context.organizationId);

  return NextResponse.json(audit);
}

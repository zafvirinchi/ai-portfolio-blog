import { NextResponse } from "next/server";

import { listUsage } from "@/lib/billing/credit-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

export async function GET() {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json([]);
  }

  const usage = await listUsage(context.organizationId);

  return NextResponse.json(usage);
}

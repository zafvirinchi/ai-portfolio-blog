import { NextResponse } from "next/server";

import * as paymentService from "@/lib/billing/payment-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

export async function GET() {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json([]);
  }

  const payments = await paymentService.list(context.organizationId);

  return NextResponse.json(payments);
}

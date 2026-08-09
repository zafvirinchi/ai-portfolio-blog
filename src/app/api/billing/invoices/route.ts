import { NextResponse } from "next/server";

import * as invoiceService from "@/lib/billing/invoice-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

export async function GET() {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json([]);
  }

  const invoices = await invoiceService.list(context.organizationId);

  return NextResponse.json(invoices);
}

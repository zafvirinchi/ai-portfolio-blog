import { NextResponse } from "next/server";

import { listCreditBalances } from "@/lib/billing/credit-service";
import { getActiveSubscription } from "@/lib/billing/subscription-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

export async function GET() {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json({ subscription: null, creditBalances: [] });
  }

  const [subscription, creditBalances] = await Promise.all([
    getActiveSubscription(context.organizationId),
    listCreditBalances(context.organizationId),
  ]);

  return NextResponse.json({ subscription, creditBalances });
}

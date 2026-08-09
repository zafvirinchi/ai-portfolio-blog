import { NextResponse } from "next/server";

import { checkoutSchema } from "@/lib/billing/billing-schema";
import { initiateCheckout } from "@/lib/billing/billing-service";
import { requirePermission } from "@/lib/saas/permission-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

export async function POST(req: Request) {
  try {
    const context = await getTenantContext();

    if (!context) {
      return NextResponse.json({ error: "Not authenticated, or no active organization membership" }, { status: 401 });
    }

    requirePermission(context, "Manage Billing");

    const body = checkoutSchema.parse(await req.json());
    const origin = new URL(req.url).origin;

    const session = await initiateCheckout({
      organizationId: context.organizationId,
      planKey: body.planKey,
      billingInterval: body.billingInterval,
      couponCode: body.couponCode,
      customerEmail: context.email,
      origin,
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error("[billing] Checkout route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Checkout failed" }, { status: 422 });
  }
}

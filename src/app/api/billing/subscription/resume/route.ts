import { NextResponse } from "next/server";

import { resumeSubscription } from "@/lib/billing/billing-service";
import { requirePermission } from "@/lib/saas/permission-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

export async function POST() {
  try {
    const context = await getTenantContext();

    if (!context) {
      return NextResponse.json({ error: "Not authenticated, or no active organization membership" }, { status: 401 });
    }

    requirePermission(context, "Manage Billing");
    await resumeSubscription(context.organizationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[billing] Subscription resume route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Resume failed" }, { status: 422 });
  }
}

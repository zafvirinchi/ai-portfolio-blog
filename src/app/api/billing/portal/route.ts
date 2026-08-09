import { NextResponse } from "next/server";

import { createPortalSession } from "@/lib/billing/billing-service";
import { requirePermission } from "@/lib/saas/permission-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

export async function POST(req: Request) {
  try {
    const context = await getTenantContext();

    if (!context) {
      return NextResponse.json({ error: "Not authenticated, or no active organization membership" }, { status: 401 });
    }

    requirePermission(context, "Manage Billing");

    const origin = new URL(req.url).origin;
    const session = await createPortalSession(context.organizationId, `${origin}/billing`);

    return NextResponse.json(session);
  } catch (error) {
    console.error("[billing] Portal route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to open billing portal" }, { status: 422 });
  }
}

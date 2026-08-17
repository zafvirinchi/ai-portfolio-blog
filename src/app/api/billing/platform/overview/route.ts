import { NextResponse } from "next/server";

import { getBillingOverview } from "@/lib/billing/entitlement-service";
import { PlatformUnauthorizedError, requireUserId } from "@/lib/billing/persona-service";

// Phase 18 Milestone 2 — Step 12. Completes M1's getBillingOverview()
// contract with a real route. Returns only the safe, application-level
// shape entitlement-service.ts already builds (BillingOverview) — never
// a Stripe secret key, webhook secret, or raw Stripe object. userId is
// always the session's own id (requireUserId()), never a query
// parameter — there is no way to request another user's billing
// overview through this route.
export async function GET() {
  try {
    const { userId } = await requireUserId();
    const overview = await getBillingOverview(userId);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[billing] Platform overview route failed", error);
    return NextResponse.json({ error: "Failed to load billing overview" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { createBillingPortalSession, NoBillingAccountError } from "@/lib/billing/platform-billing-service";
import { PlatformUnauthorizedError, requireUserId } from "@/lib/billing/persona-service";

// Phase 18 Milestone 2 — Step 13 ("Manage Subscription"). The Stripe
// customer id is NEVER accepted from the client (Step 13's own explicit
// warning) — createBillingPortalSession() looks it up server-side from
// platform_billing_customers by the session-derived userId alone.
export async function POST(req: Request) {
  try {
    const { userId } = await requireUserId();

    // Phase 19 M4, Step 11 — a distinguishing return marker, mirroring
    // initiateCheckout()'s own `?checkout=success` convention. Without
    // it, a portal-driven plan change (e.g. a downgrade or cancellation)
    // returns to the exact same bare /settings/billing URL an ordinary
    // page visit would, giving the client no signal to account for
    // Stripe's webhook still being in flight (see page.tsx's own
    // bounded-retry handling for both markers).
    const origin = new URL(req.url).origin;
    const session = await createBillingPortalSession(userId, `${origin}/settings/billing?billing=updated`);

    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof NoBillingAccountError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("[billing] Platform portal route failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to open billing portal" }, { status: 422 });
  }
}

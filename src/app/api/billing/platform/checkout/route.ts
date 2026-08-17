import { NextResponse } from "next/server";

import { DuplicateSubscriptionError, InvalidPlanError, initiateCheckout } from "@/lib/billing/platform-billing-service";
import { PlatformUnauthorizedError, requireUserId } from "@/lib/billing/persona-service";

// Phase 18 Milestone 2 — Step 7. userId/email are ALWAYS server-derived
// from the real Supabase session (never a request body) via
// requireUserId() (persona-service.ts). The only thing the client
// supplies is `planKey`, and it is validated against the server-side
// plan registry (initiateCheckout -> InvalidPlanError) before anything
// reaches Stripe — an unrecognized or non-Stripe-backed key never gets
// anywhere near a real checkout session.
export async function POST(req: Request) {
  try {
    const { userId, email } = await requireUserId();

    const body = await req.json();
    const planKey = typeof body?.planKey === "string" ? body.planKey : "";

    const origin = new URL(req.url).origin;

    const session = await initiateCheckout({ userId, email, planKey, origin });

    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof InvalidPlanError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof DuplicateSubscriptionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("[billing] Platform checkout route failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Checkout failed" }, { status: 422 });
  }
}

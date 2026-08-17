import { NextResponse } from "next/server";

import { handlePlatformStripeWebhook } from "@/lib/billing/platform-billing-service";

// Phase 18 Milestone 2 — Step 8. Mirrors the existing organization
// webhook route (api/billing/webhooks/stripe/route.ts) exactly for the
// raw-body-reading discipline: App Router Route Handlers don't
// auto-parse the body, and req.text() here is genuinely the raw bytes
// Stripe signed — required for stripe.webhooks.constructEventAsync() to
// verify the signature correctly. This is a SEPARATE endpoint from the
// organization one (different URL, registered separately in the Stripe
// dashboard, its own STRIPE_PLATFORM_WEBHOOK_SECRET) — never routes
// organization billing events here or vice versa.
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await req.text();

  try {
    const result = await handlePlatformStripeWebhook(rawBody, signature);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    // Signature verification failures land here too (Stripe.errors.
    // StripeSignatureVerificationError) — always a 400, never leaking
    // which part of verification failed, matching the organization
    // webhook route's own behavior.
    console.error("[billing:platform] Stripe webhook verification/handling failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook handling failed" }, { status: 400 });
  }
}

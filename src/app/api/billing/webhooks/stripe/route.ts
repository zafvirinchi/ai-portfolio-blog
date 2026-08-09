import { NextResponse } from "next/server";

import { handleStripeWebhook } from "@/lib/billing/billing-service";

// First webhook route in this app. App Router Route Handlers don't
// auto-parse the request body, so req.text() here is genuinely the raw
// body Stripe signed — required for stripe.webhooks.constructEventAsync()
// to verify the signature correctly.
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await req.text();

  try {
    const result = await handleStripeWebhook(rawBody, signature);

    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("[billing] Stripe webhook verification/handling failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook handling failed" }, { status: 400 });
  }
}

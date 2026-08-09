import Stripe from "stripe";

import { BillingProvider, CheckoutSessionInput, PortalSessionInput, ProviderWebhookEvent } from "./billing-provider";

let stripeClient: Stripe | null = null;

/** Lazily constructed — never throws at import time, only when a Stripe call is actually attempted without a configured key, matching this project's "code-ready pending external config" posture (same as OAuth/SSO in Milestone 2). */
function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured. Add it to .env.local to enable real Stripe checkout.");
  }

  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

export class StripeBillingProvider implements BillingProvider {
  readonly id = "stripe" as const;

  async createCheckoutSession(input: CheckoutSessionInput): Promise<{ url: string }> {
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.existingCustomerId ?? undefined,
      customer_email: input.existingCustomerId ? undefined : (input.customerEmail ?? undefined),
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `${input.plan.name} Plan` },
            unit_amount: input.unitAmountCents,
            recurring: { interval: input.billingInterval === "yearly" ? "year" : "month" },
          },
          quantity: 1,
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { organizationId: input.organizationId, planKey: input.plan.key, couponCode: input.couponCode ?? "" },
      subscription_data: { metadata: { organizationId: input.organizationId, planKey: input.plan.key } },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return { url: session.url };
  }

  async createPortalSession(input: PortalSessionInput): Promise<{ url: string }> {
    const stripe = getStripeClient();

    const session = await stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });

    return { url: session.url };
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    const stripe = getStripeClient();
    await stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: true });
  }

  async resumeSubscription(providerSubscriptionId: string): Promise<void> {
    const stripe = getStripeClient();
    await stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: false });
  }

  async verifyAndConstructWebhookEvent(rawBody: string, signature: string): Promise<ProviderWebhookEvent> {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
    }

    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);

    return { type: event.type, raw: event };
  }
}

export const stripeBillingProvider = new StripeBillingProvider();

import Stripe from "stripe";

import { STRIPE_BACKED_PLAN_KEYS, StripeBackedPlanKey } from "./platform-schema";

const LOG_PREFIX = "[billing:platform-stripe]";

// Phase 18 Milestone 2 — the ONLY file that calls the `stripe` SDK for
// platform (individual-user) billing, mirroring stripe-provider.ts's own
// "one file, lazily-constructed client" discipline for the organization
// system. Deliberately NOT reusing StripeBillingProvider/BillingProvider
// (billing-provider.ts): that interface is shaped around
// organizationId + dynamic price_data (coupon-adjusted amounts) — a
// genuinely different checkout model from this milestone's fixed,
// price-ID-based plan catalog (Step 6's own explicit instruction).
// Reuses the SAME STRIPE_SECRET_KEY env var (one Stripe account for the
// whole app) but a SEPARATE webhook signing secret, since this is a
// distinct webhook endpoint URL that must be registered separately in
// the Stripe dashboard.

let stripeClient: Stripe | null = null;

/** Never throws at import time — only when a Stripe call is actually attempted without a configured key, matching stripe-provider.ts's own "code-ready pending external config" posture. */
function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured. Add it to .env.local to enable platform checkout.");
  }

  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

// One env var per Stripe-backed plan — Step 6's own explicit preference
// ("prefer environment configuration for Stripe price IDs") over this
// milestone's alternative of dynamic price_data. No production secret
// or account-specific id is hardcoded into source; every id is read
// from the environment at call time, and a missing one fails loudly
// (never silently falls back to a fabricated price).
const PRICE_ID_ENV_VAR: Record<StripeBackedPlanKey, string> = {
  JOB_SEEKER_PRO: "STRIPE_PRICE_JOB_SEEKER_PRO",
  JOB_SEEKER_PREMIUM: "STRIPE_PRICE_JOB_SEEKER_PREMIUM",
  RECRUITER_PRO: "STRIPE_PRICE_RECRUITER_PRO",
  RECRUITER_BUSINESS: "STRIPE_PRICE_RECRUITER_BUSINESS",
};

export class PlanNotStripeBackedError extends Error {
  constructor(planKey: string) {
    super(`"${planKey}" has no Stripe price configured — it isn't a purchasable plan.`);
    this.name = "PlanNotStripeBackedError";
  }
}

/** The one place a PlatformPlanKey resolves to a real Stripe price id — throws (never fabricates one) if the plan isn't Stripe-backed at all, or if the operator hasn't configured its env var yet. */
export function resolveStripePriceId(planKey: string): string {
  if (!(STRIPE_BACKED_PLAN_KEYS as readonly string[]).includes(planKey)) {
    throw new PlanNotStripeBackedError(planKey);
  }

  const envVar = PRICE_ID_ENV_VAR[planKey as StripeBackedPlanKey];
  const priceId = process.env[envVar];

  if (!priceId) {
    throw new Error(`${envVar} is not configured. Add it to .env.local to enable checkout for this plan.`);
  }

  return priceId;
}

/** The inverse lookup (webhook processing needs plan-from-price, not price-from-plan) — built from the same env vars, so it's always in sync with resolveStripePriceId() by construction. */
export function resolvePlanKeyFromPriceId(stripePriceId: string): StripeBackedPlanKey | null {
  for (const planKey of STRIPE_BACKED_PLAN_KEYS) {
    const envVar = PRICE_ID_ENV_VAR[planKey];
    if (process.env[envVar] === stripePriceId) return planKey;
  }

  return null;
}

export async function createStripeCustomer(email: string | null, userId: string): Promise<string> {
  const stripe = getStripeClient();

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    // The only place userId is attached to a Stripe object at creation
    // time — every later webhook event reconciles back to this mapping
    // via stripe_customer_id (platform-subscription-service.ts), never
    // by trusting a later event's own metadata alone (Step 16 #15).
    metadata: { userId },
  });

  console.log(`${LOG_PREFIX} Customer Created`, { userId, customerId: customer.id });

  return customer.id;
}

export interface CreateCheckoutSessionInput {
  userId: string;
  planKey: StripeBackedPlanKey;
  stripeCustomerId: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ url: string }> {
  const stripe = getStripeClient();
  const priceId = resolveStripePriceId(input.planKey);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // Metadata on BOTH the session and the resulting subscription —
    // informational/defense-in-depth only. The webhook handler never
    // trusts this as the SOLE source of userId; it's cross-checked
    // against the customer mapping (Step 8/16).
    metadata: { userId: input.userId, planKey: input.planKey },
    subscription_data: { metadata: { userId: input.userId, planKey: input.planKey } },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  return { url: session.url };
}

export async function createPortalSession(stripeCustomerId: string, returnUrl: string): Promise<{ url: string }> {
  const stripe = getStripeClient();

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

export interface VerifiedWebhookEvent {
  type: string;
  raw: Stripe.Event;
}

/**
 * Real Stripe signature verification (stripe.webhooks.constructEventAsync)
 * — the raw body is NEVER JSON.parse'd before this succeeds (Step 8's
 * own explicit warning). Uses a SEPARATE signing secret from the
 * organization webhook (STRIPE_PLATFORM_WEBHOOK_SECRET) since this is a
 * distinct endpoint URL registered separately in the Stripe dashboard.
 */
export async function verifyPlatformWebhookSignature(rawBody: string, signature: string): Promise<VerifiedWebhookEvent> {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("STRIPE_PLATFORM_WEBHOOK_SECRET is not configured.");
  }

  const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);

  return { type: event.type, raw: event };
}

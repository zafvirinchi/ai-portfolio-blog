import type Stripe from "stripe";

import { PLATFORM_PLAN_DEFINITIONS } from "./platform-plan-registry";
import { PlatformSubscriptionStatus, STRIPE_BACKED_PLAN_KEYS, StripeBackedPlanKey } from "./platform-schema";
import {
  getCustomerByUserId,
  getUserIdByStripeCustomerId,
  resolveStripeBackedPlan,
  saveCustomer,
  upsertSubscription,
} from "./platform-subscription-service";
import { createCheckoutSession, createPortalSession, createStripeCustomer, resolvePlanKeyFromPriceId, verifyPlatformWebhookSignature } from "./platform-stripe-provider";
import { activateRecruiterPersona } from "./persona-service";

const LOG_PREFIX = "[billing:platform]";

// Phase 18 Milestone 2 — the ONLY orchestration layer for platform
// checkout/portal/webhooks, mirroring billing-service.ts's own role for
// the organization system: routes call these functions, never
// platform-stripe-provider.ts or platform-subscription-service.ts
// directly.

export class InvalidPlanError extends Error {
  constructor(planKey: string) {
    super(`"${planKey}" is not a valid, Stripe-backed platform plan.`);
    this.name = "InvalidPlanError";
  }
}

export class DuplicateSubscriptionError extends Error {
  constructor() {
    super("You already have an active subscription in this plan family — manage it from the billing portal instead of starting a new checkout.");
    this.name = "DuplicateSubscriptionError";
  }
}

export class NoBillingAccountError extends Error {
  constructor() {
    super("No billing account yet — subscribe to a paid plan first.");
    this.name = "NoBillingAccountError";
  }
}

function isStripeBackedPlanKey(value: string): value is StripeBackedPlanKey {
  return (STRIPE_BACKED_PLAN_KEYS as readonly string[]).includes(value);
}

async function getOrCreateStripeCustomer(userId: string, email: string | null): Promise<string> {
  const existing = await getCustomerByUserId(userId);
  if (existing) return existing.stripe_customer_id;

  const stripeCustomerId = await createStripeCustomer(email, userId);
  await saveCustomer({ userId, stripeCustomerId, email });

  return stripeCustomerId;
}

export interface InitiateCheckoutInput {
  userId: string;
  email: string | null;
  planKey: string;
  origin: string;
}

/**
 * Step 6/7 — every requested plan is validated against the server-side
 * registry before anything else happens; an unrecognized or non-
 * Stripe-backed planKey never reaches Stripe at all (InvalidPlanError,
 * mapped to 400 by the route). userId/email are never read from
 * `input` as anything other than what the caller (the route) already
 * resolved from the Supabase session — this function has no code path
 * that accepts them from a request body.
 */
export async function initiateCheckout(input: InitiateCheckoutInput): Promise<{ url: string }> {
  if (!isStripeBackedPlanKey(input.planKey)) {
    throw new InvalidPlanError(input.planKey);
  }

  const plan = PLATFORM_PLAN_DEFINITIONS[input.planKey];

  // Phase 23 Milestone 4 — audit finding: resolveEffectivePlans() only
  // ever resolves a plan for a role already in app_metadata.platform_roles
  // (entitlement-service.ts's roles.map()) — it never inspects a Stripe
  // subscription for a role the user doesn't hold. Before this fix, a
  // caller could reach this function directly (e.g. a raw API call,
  // bypassing /recruiter's activation gate and /settings/billing's own
  // role-filtered plan cards, which never show a RECRUITER plan to a
  // non-recruiter) and successfully pay for a RECRUITER plan that
  // resolveEffectivePlans() would then permanently ignore — a real
  // "payment succeeded but plan is ignored" state. Self-service-activate
  // here, reusing the exact same additive/idempotent function
  // /recruiter's own activation button calls, so checkout can never
  // outrun role activation. JOB_SEEKER needs no such step (already every
  // account's default); ADMIN has no billable plan tier at all (no
  // ADMIN_* key exists in PLATFORM_PLAN_DEFINITIONS), so plan.role here
  // is always JOB_SEEKER or RECRUITER.
  if (plan.role === "RECRUITER") {
    await activateRecruiterPersona(input.userId);
  }

  const existingPaid = await resolveStripeBackedPlan(input.userId, plan.role);
  if (existingPaid) {
    throw new DuplicateSubscriptionError();
  }

  const stripeCustomerId = await getOrCreateStripeCustomer(input.userId, input.email);

  return createCheckoutSession({
    userId: input.userId,
    planKey: input.planKey,
    stripeCustomerId,
    successUrl: `${input.origin}/settings/billing?checkout=success`,
    cancelUrl: `${input.origin}/settings/billing?checkout=cancelled`,
  });
}

export async function createBillingPortalSession(userId: string, returnUrl: string): Promise<{ url: string }> {
  const customer = await getCustomerByUserId(userId);

  if (!customer) {
    throw new NoBillingAccountError();
  }

  return createPortalSession(customer.stripe_customer_id, returnUrl);
}

// ---------------------------------------------------------------------------
// Step 8/9/11/16 — webhook processing.
// ---------------------------------------------------------------------------

/** Fail-closed exhaustive mapping (Step 11) — 'paused' (a rarely-used Stripe feature with no distinct concept in this milestone's status set) is treated as 'canceled', never as paid access. */
function mapStripeStatus(status: Stripe.Subscription.Status): PlatformSubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "paused":
    default:
      return "canceled";
  }
}

function customerIdOf(customer: Stripe.Subscription["customer"]): string {
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Step 16 #15 — the single most security-sensitive line in this file:
 * userId is resolved from platform_billing_customers via the
 * subscription's own `customer` field (a real Stripe-verified
 * relationship), NEVER from `subscription.metadata.userId` directly.
 * Metadata is only used as a defense-in-depth sanity check (logged on
 * mismatch, never trusted over the resolved mapping) — a forged/altered
 * metadata value can at most cause a harmless log line, never redirect
 * a subscription update to the wrong user's row, since upsertSubscription()
 * always writes under the userId THIS function resolved, not whatever
 * metadata claimed.
 */
/** eventCreatedAt is the wrapping Stripe.Event's own `created` time (unix seconds, ISO here) — NEVER the subscription object's own `.created` (when the subscription itself started), which stays constant across every event it ever receives and so couldn't distinguish an old delivery from a new one. Threaded through to upsertSubscription()'s out-of-order guard. */
async function upsertFromStripeSubscription(subscription: Stripe.Subscription, eventCreatedAt: string): Promise<void> {
  const stripeCustomerId = customerIdOf(subscription.customer);
  const userId = await getUserIdByStripeCustomerId(stripeCustomerId);

  if (!userId) {
    console.error(`${LOG_PREFIX} No known platform customer for this Stripe customer — ignoring event`, { stripeCustomerId });
    return;
  }

  const metadataUserId = subscription.metadata?.userId;
  if (metadataUserId && metadataUserId !== userId) {
    console.error(`${LOG_PREFIX} Subscription metadata userId did not match the resolved customer mapping — using the resolved mapping, ignoring metadata`, {
      metadataUserId,
      resolvedUserId: userId,
      stripeSubscriptionId: subscription.id,
    });
  }

  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price.id;

  if (!priceId) {
    console.error(`${LOG_PREFIX} Subscription has no price item — ignoring`, { stripeSubscriptionId: subscription.id });
    return;
  }

  const planKey = resolvePlanKeyFromPriceId(priceId);

  if (!planKey) {
    console.error(`${LOG_PREFIX} Subscription price id doesn't map to any known platform plan — ignoring`, { priceId, stripeSubscriptionId: subscription.id });
    return;
  }

  await upsertSubscription({
    userId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    planId: planKey,
    status: mapStripeStatus(subscription.status),
    currentPeriodStart: firstItem ? new Date(firstItem.current_period_start * 1000).toISOString() : null,
    currentPeriodEnd: firstItem ? new Date(firstItem.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    eventCreatedAt,
  });
}

/**
 * checkout.session.completed only confirms/repairs the customer<->user
 * mapping — it never creates or upgrades the subscription row itself.
 * The authoritative subscription state (including whether payment
 * actually cleared — e.g. still "incomplete" pending 3-D Secure) always
 * comes from customer.subscription.created/updated, exactly per Step
 * 8's own warning against treating checkout completion alone as proof
 * of a paid subscription.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  const stripeCustomerId = session.customer ? customerIdOf(session.customer as Stripe.Subscription["customer"]) : null;

  if (!userId || !stripeCustomerId) {
    console.error(`${LOG_PREFIX} checkout.session.completed missing metadata/customer`, { sessionId: session.id });
    return;
  }

  const existingUserId = await getUserIdByStripeCustomerId(stripeCustomerId);
  if (existingUserId && existingUserId !== userId) {
    console.error(`${LOG_PREFIX} checkout.session.completed customer already mapped to a different user — ignoring`, { stripeCustomerId, existingUserId, metadataUserId: userId });
    return;
  }

  if (!existingUserId) {
    await saveCustomer({ userId, stripeCustomerId, email: session.customer_details?.email ?? null });
  }
}

export async function handlePlatformStripeWebhook(rawBody: string, signature: string): Promise<{ handled: boolean; type: string }> {
  const { type, raw: event } = await verifyPlatformWebhookSignature(rawBody, signature);

  switch (type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // Stripe already sets .status to "canceled" on the deleted event
      // itself — the same upsert path handles all three correctly with
      // no special-casing. event.created is THIS event's own timestamp
      // (unix seconds) — the out-of-order guard's ordering key.
      await upsertFromStripeSubscription(event.data.object as Stripe.Subscription, new Date(event.created * 1000).toISOString());
      break;
    default:
      return { handled: false, type };
  }

  return { handled: true, type };
}

import type Stripe from "stripe";

import { supabaseAdmin } from "../supabase/admin";

import { getBillingProvider } from "./billing-provider";
import { BillingInterval, PlanKey } from "./billing-schema";
import * as couponService from "./coupon-service";
import * as invoiceService from "./invoice-service";
import * as paymentService from "./payment-service";
import { getPlanByKey, seedPlans } from "./plan-service";
import * as subscriptionService from "./subscription-service";

const LOG_PREFIX = "[billing]";

// The ONLY file (besides stripe-provider.ts itself) in this app that
// resolves a BillingProvider — every route goes through the functions
// below, never through the `stripe` package directly.

export interface InitiateCheckoutInput {
  organizationId: string;
  planKey: Exclude<PlanKey, "free">;
  billingInterval: BillingInterval;
  couponCode?: string;
  customerEmail: string | null;
  origin: string;
}

export async function initiateCheckout(input: InitiateCheckoutInput): Promise<{ url: string }> {
  await seedPlans();
  const plan = await getPlanByKey(input.planKey);
  const basePrice = input.billingInterval === "yearly" ? plan.yearly_price_cents : plan.monthly_price_cents;

  let unitAmountCents = basePrice;

  if (input.couponCode) {
    const coupon = await couponService.validate(input.couponCode);
    unitAmountCents = basePrice - couponService.calculateDiscount(coupon, basePrice);
  }

  const existing = await subscriptionService.getActiveSubscription(input.organizationId);
  const provider = getBillingProvider("stripe");

  return provider.createCheckoutSession({
    organizationId: input.organizationId,
    plan,
    billingInterval: input.billingInterval,
    unitAmountCents,
    customerEmail: input.customerEmail,
    existingCustomerId: existing.isImplicitFree ? null : existing.provider_customer_id,
    successUrl: `${input.origin}/billing?checkout=success`,
    cancelUrl: `${input.origin}/billing/plans?checkout=cancelled`,
    couponCode: input.couponCode,
  });
}

export async function createPortalSession(organizationId: string, returnUrl: string): Promise<{ url: string }> {
  const subscription = await subscriptionService.getActiveSubscription(organizationId);

  if (subscription.isImplicitFree || !subscription.provider_customer_id) {
    throw new Error("No billing account yet — upgrade to a paid plan first.");
  }

  const provider = getBillingProvider("stripe");
  return provider.createPortalSession({ customerId: subscription.provider_customer_id, returnUrl });
}

export async function cancelSubscription(organizationId: string): Promise<void> {
  const subscription = await subscriptionService.getActiveSubscription(organizationId);

  if (subscription.isImplicitFree) {
    throw new Error("You're already on the Free plan.");
  }

  if (subscription.provider_subscription_id) {
    const provider = getBillingProvider(subscription.provider as "stripe");
    await provider.cancelSubscription(subscription.provider_subscription_id);
  }

  await subscriptionService.cancel(organizationId);
}

export async function resumeSubscription(organizationId: string): Promise<void> {
  const subscription = await subscriptionService.getActiveSubscription(organizationId);

  if (subscription.isImplicitFree) {
    throw new Error("You're already on the Free plan.");
  }

  if (subscription.provider_subscription_id) {
    const provider = getBillingProvider(subscription.provider as "stripe");
    await provider.resumeSubscription(subscription.provider_subscription_id);
  }

  await subscriptionService.resume(organizationId);
}

// ---------------------------------------------------------------------------
// Stripe webhook handling — the raw Stripe event shape is only known
// here (type-only import of `Stripe` for narrowing), never leaking a
// live SDK call outside stripe-provider.ts.
// ---------------------------------------------------------------------------

export async function handleStripeWebhook(rawBody: string, signature: string): Promise<{ handled: boolean; type: string }> {
  const provider = getBillingProvider("stripe");
  const { type, raw } = await provider.verifyAndConstructWebhookEvent(rawBody, signature);
  const event = raw as Stripe.Event;
  // Phase 21 Milestone 2 — the Stripe event's own authoritative clock,
  // used (not wall-clock Date.now()) for every ordering-sensitive write
  // below — see subscription-service.ts's upsertFromProvider()/
  // markCanceled() for the full rationale.
  const eventCreatedAt = new Date(event.created * 1000).toISOString();

  switch (type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, eventCreatedAt);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, eventCreatedAt);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, eventCreatedAt);
      break;
    default:
      return { handled: false, type };
  }

  return { handled: true, type };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventCreatedAt: string): Promise<void> {
  const organizationId = session.metadata?.organizationId;
  const planKey = session.metadata?.planKey as PlanKey | undefined;
  const couponCode = session.metadata?.couponCode;

  if (!organizationId || !planKey) {
    console.error(`${LOG_PREFIX} checkout.session.completed missing metadata`, { sessionId: session.id });
    return;
  }

  const customerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);

  const subscription = await subscriptionService.upsertFromProvider({
    organizationId,
    planKey,
    billingInterval: "monthly",
    status: "active",
    provider: "stripe",
    providerCustomerId: customerId,
    providerSubscriptionId: subscriptionId,
    currentPeriodEnd: null,
    eventCreatedAt,
  });

  const amountCents = session.amount_total ?? 0;

  const payment = await paymentService.record({
    organizationId,
    subscriptionId: subscription.id,
    provider: "stripe",
    providerPaymentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
    amountCents,
    currency: session.currency ?? "usd",
    status: "succeeded",
  });

  // Phase 21 Milestone 2 — a duplicate payment (redelivered webhook,
  // detected by payment-service.ts's own dedup check) means this
  // checkout was already fully processed once; writing a second invoice
  // for it would duplicate the organization's invoice history for no
  // new real payment.
  if (payment) {
    await invoiceService.create({ organizationId, subscriptionId: subscription.id, amountCents });
  }

  if (couponCode) {
    try {
      await couponService.applyToOrganization(organizationId, couponCode, subscription.id);
    } catch (error) {
      console.error(`${LOG_PREFIX} Coupon redemption failed after successful checkout`, error);
    }
  }

  console.log(`${LOG_PREFIX} Subscription Created`, { organizationId, planKey });
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const organizationId = await resolveOrganizationIdFromCustomer(invoice.customer);
  if (!organizationId) return;

  const subscription = await subscriptionService.getActiveSubscription(organizationId);
  const amountCents = invoice.amount_paid;

  const payment = await paymentService.record({
    organizationId,
    subscriptionId: subscription.isImplicitFree ? null : subscription.id,
    provider: "stripe",
    providerPaymentId: invoice.id ?? null,
    amountCents,
    currency: invoice.currency,
    status: "succeeded",
  });

  // See handleCheckoutCompleted's identical Phase 21 Milestone 2 comment.
  if (payment) {
    await invoiceService.create({ organizationId, subscriptionId: subscription.isImplicitFree ? null : subscription.id, amountCents });
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const organizationId = await resolveOrganizationIdFromCustomer(invoice.customer);
  if (!organizationId) return;

  const subscription = await subscriptionService.getActiveSubscription(organizationId);

  await paymentService.record({
    organizationId,
    subscriptionId: subscription.isImplicitFree ? null : subscription.id,
    provider: "stripe",
    providerPaymentId: invoice.id ?? null,
    amountCents: invoice.amount_due,
    currency: invoice.currency,
    status: "failed",
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, eventCreatedAt: string): Promise<void> {
  const organizationId = subscription.metadata?.organizationId;
  const planKey = subscription.metadata?.planKey as PlanKey | undefined;

  if (!organizationId || !planKey) return;

  const firstItem = subscription.items.data[0];
  const currentPeriodEnd = firstItem ? new Date(firstItem.current_period_end * 1000).toISOString() : null;

  const status = subscription.status === "active" ? "active" : subscription.status === "past_due" ? "past_due" : "active";

  await subscriptionService.upsertFromProvider({
    organizationId,
    planKey,
    billingInterval: firstItem?.price.recurring?.interval === "year" ? "yearly" : "monthly",
    status,
    provider: "stripe",
    providerCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    providerSubscriptionId: subscription.id,
    currentPeriodEnd,
    eventCreatedAt,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, eventCreatedAt: string): Promise<void> {
  const organizationId = subscription.metadata?.organizationId;
  if (!organizationId) return;

  await subscriptionService.markCanceled(organizationId, eventCreatedAt);
}

async function resolveOrganizationIdFromCustomer(customer: Stripe.Invoice["customer"]): Promise<string | null> {
  const customerId = typeof customer === "string" ? customer : (customer?.id ?? null);
  if (!customerId) return null;

  const { data } = await supabaseAdmin.from("subscriptions").select("organization_id").eq("provider_customer_id", customerId).maybeSingle();

  return data?.organization_id ?? null;
}

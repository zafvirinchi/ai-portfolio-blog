import { supabaseAdmin } from "../supabase/admin";

import { BillingInterval, PlanKey, SubscriptionStatus } from "./billing-schema";
import { ResolvedSubscription, Subscription } from "./billing-types";
import { getPlanByKey, getPlanById, PLAN_DEFINITIONS } from "./plan-service";

const LOG_PREFIX = "[billing]";
const GRACE_PERIOD_DAYS = 7;
const DEFAULT_TRIAL_DAYS = 14;

function virtualFreeSubscription(organizationId: string): ResolvedSubscription {
  const plan = { id: "free", created_at: new Date(0).toISOString(), ...PLAN_DEFINITIONS.free };

  return {
    id: `implicit-free-${organizationId}`,
    organization_id: organizationId,
    plan_id: plan.id,
    status: "active",
    billing_interval: "monthly",
    provider: "stripe",
    provider_customer_id: null,
    provider_subscription_id: null,
    current_period_end: null,
    trial_end: null,
    cancel_at: null,
    grace_period_end: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    plan,
    isImplicitFree: true,
  };
}

/**
 * Every organization implicitly has a Free plan the moment one is
 * asked for — no DB row required, no dependency on
 * organization-service.ts (protected, untouched). Falls back to the
 * virtual Free plan on ANY query failure too (e.g. the `subscriptions`
 * table not existing yet, pre-migration), not just "no row found" —
 * this is the credit engine's core no-break guarantee, so it must
 * never throw before real billing data exists.
 */
export async function getActiveSubscription(organizationId: string): Promise<ResolvedSubscription> {
  const { data, error } = await supabaseAdmin.from("subscriptions").select("*").eq("organization_id", organizationId).maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} Subscription lookup failed, treating as Free plan`, error);
    return virtualFreeSubscription(organizationId);
  }

  if (!data) {
    return virtualFreeSubscription(organizationId);
  }

  const row = data as Subscription;
  const plan = (await getPlanById(row.plan_id)) ?? { id: row.plan_id, created_at: new Date(0).toISOString(), ...PLAN_DEFINITIONS.free };

  // Past-period-end with no active provider subscription means the
  // grace period has started (or, past the grace window, effectively
  // reverted to Free — still returned as the real row so history/UI
  // can show "expired", but callers checking limits should treat an
  // expired grace period the same as Free via isExpiredPastGrace()).
  return { ...row, plan, isImplicitFree: false };
}

export function isExpiredPastGrace(subscription: ResolvedSubscription): boolean {
  if (subscription.isImplicitFree) return false;
  if (subscription.status === "canceled") return true;

  if (subscription.grace_period_end) {
    return new Date(subscription.grace_period_end).getTime() < Date.now();
  }

  return false;
}

/** Existing-row lookup for upsertFromProvider()/markCanceled()'s own out-of-order guard below — not exported further than this file needs. */
async function getExistingSubscriptionRow(organizationId: string): Promise<Subscription | null> {
  const { data, error } = await supabaseAdmin.from("subscriptions").select("*").eq("organization_id", organizationId).maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} Existing-subscription lookup failed, proceeding as if none exists`, error);
    return null;
  }

  return (data as Subscription) ?? null;
}

/**
 * Upserted by the Stripe webhook handler (billing-service.ts) after
 * checkout.session.completed / customer.subscription.updated. Upsert by
 * organization_id is naturally idempotent for a REPLAYED event (Stripe
 * redelivering the exact same event just re-writes the same row).
 *
 * Phase 21 Milestone 2 — Stripe does not guarantee webhook delivery
 * ORDER (a separate concern from duplicate delivery, already handled by
 * the upsert above): a delayed customer.subscription.updated carrying an
 * OLDER snapshot could otherwise arrive and overwrite a newer one, e.g.
 * transiently reverting a just-renewed subscription back to a stale
 * past_due status. Guarded here by repurposing the existing updated_at
 * column to record the STRIPE EVENT's own `created` timestamp
 * (eventCreatedAt) rather than this row's wall-clock write time — no new
 * column/migration needed. This exact pattern (down to the log wording)
 * already exists in this codebase's OTHER billing system —
 * platform-subscription-service.ts's upsertSubscription() — and is
 * ported here unchanged, not redesigned. subscription-analytics.ts's
 * churn calculation already documents that it treats
 * subscriptions.updated_at as an approximation of "when this happened,"
 * not a strict wall-clock write-time guarantee — using the Stripe
 * event's own clock instead of webhook-processing race timing makes that
 * approximation MORE accurate, not less. If a row already exists for
 * this organization with an equal-or-newer eventCreatedAt, the incoming
 * event is stale and is skipped entirely — logged, not thrown, since an
 * out-of-order delivery is expected Stripe behavior, not an error.
 * Read-then-write, not a single atomic statement — see this file's test
 * suite for the documented, judged-acceptable non-atomicity tradeoff
 * (identical reasoning to the platform system's own upsertSubscription()
 * comment).
 */
export async function upsertFromProvider(input: {
  organizationId: string;
  planKey: PlanKey;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  /** The Stripe event's own `created` time (ISO) — never wall-clock Date.now() — see the out-of-order guard above. */
  eventCreatedAt: string;
}): Promise<Subscription> {
  const plan = await getPlanByKey(input.planKey);

  const existing = await getExistingSubscriptionRow(input.organizationId);

  if (existing && existing.updated_at >= input.eventCreatedAt) {
    console.warn(`${LOG_PREFIX} Ignoring out-of-order/stale webhook event for an already-newer subscription row`, {
      organizationId: input.organizationId,
      existingUpdatedAt: existing.updated_at,
      incomingEventCreatedAt: input.eventCreatedAt,
    });
    return existing;
  }

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        organization_id: input.organizationId,
        plan_id: plan.id,
        status: input.status,
        billing_interval: input.billingInterval,
        provider: input.provider,
        provider_customer_id: input.providerCustomerId,
        provider_subscription_id: input.providerSubscriptionId,
        current_period_end: input.currentPeriodEnd,
        cancel_at: null,
        grace_period_end: null,
        updated_at: input.eventCreatedAt,
      },
      { onConflict: "organization_id" }
    )
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Subscription Updated`, { organizationId: input.organizationId, planKey: input.planKey, status: input.status });

  return data as Subscription;
}

export async function startTrial(organizationId: string, planKey: PlanKey, trialDays = DEFAULT_TRIAL_DAYS): Promise<Subscription> {
  const plan = await getPlanByKey(planKey);
  const trialEnd = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        organization_id: organizationId,
        plan_id: plan.id,
        status: "trialing",
        billing_interval: "monthly",
        provider: "stripe",
        trial_end: trialEnd,
        current_period_end: trialEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    )
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Subscription Created`, { organizationId, planKey, status: "trialing" });

  return data as Subscription;
}

/** Cancels at the end of the current period (Stripe's own default cancellation behavior) rather than immediately, then enters a grace period once that period actually ends. */
export async function cancel(organizationId: string): Promise<Subscription> {
  const current = await getActiveSubscription(organizationId);

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      cancel_at: current.current_period_end,
      grace_period_end: current.current_period_end
        ? new Date(new Date(current.current_period_end).getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Subscription Updated`, { organizationId, action: "cancel_scheduled" });

  return data as Subscription;
}

export async function resume(organizationId: string): Promise<Subscription> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .update({ cancel_at: null, grace_period_end: null, status: "active", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Subscription Updated`, { organizationId, action: "resumed" });

  return data as Subscription;
}

/**
 * Called by the webhook handler on customer.subscription.deleted. Phase
 * 21 Milestone 2 — same out-of-order guard as upsertFromProvider() above:
 * a delayed deletion event arriving after a newer reactivation/update was
 * already applied must not incorrectly cancel the now-current state.
 */
export async function markCanceled(organizationId: string, eventCreatedAt: string): Promise<void> {
  const existing = await getExistingSubscriptionRow(organizationId);

  if (existing && existing.updated_at >= eventCreatedAt) {
    console.warn(`${LOG_PREFIX} Ignoring out-of-order/stale cancellation event for an already-newer subscription row`, {
      organizationId,
      existingUpdatedAt: existing.updated_at,
      incomingEventCreatedAt: eventCreatedAt,
    });
    return;
  }

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", updated_at: eventCreatedAt })
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Subscription Updated`, { organizationId, action: "canceled" });
}

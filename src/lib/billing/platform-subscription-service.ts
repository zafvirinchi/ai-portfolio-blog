import { supabaseAdmin } from "../supabase/admin";

import { PlatformRole, PlatformSubscriptionStatus, StripeBackedPlanKey } from "./platform-schema";

const LOG_PREFIX = "[billing:platform-subscription]";
const CUSTOMERS_TABLE = "platform_billing_customers";
const SUBSCRIPTIONS_TABLE = "platform_subscriptions";

// Phase 18 Milestone 2 — the DB layer for platform billing, mirroring
// subscription-service.ts's own "graceful fallback on ANY query
// failure, including a pre-migration missing table" discipline exactly
// — a read failure here must never throw and break the (free) feature
// it's layered under; it degrades to "no Stripe subscription found",
// which resolveEffectivePlans() (entitlement-service.ts) already
// treats as FREE. This is the "fail closed for paid entitlements" rule
// (Step 10) implemented at its source: the only way this file ever
// reports a paid plan is a real row actually being found.

export interface PlatformBillingCustomer {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export async function getCustomerByUserId(userId: string): Promise<PlatformBillingCustomer | null> {
  const { data, error } = await supabaseAdmin.from(CUSTOMERS_TABLE).select("*").eq("user_id", userId).maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} Customer lookup failed`, error);
    return null;
  }

  return (data as PlatformBillingCustomer) ?? null;
}

export async function getUserIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from(CUSTOMERS_TABLE).select("user_id").eq("stripe_customer_id", stripeCustomerId).maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} Reverse customer lookup failed`, error);
    return null;
  }

  return data?.user_id ?? null;
}

/** Existing-row lookup for upsertSubscription()'s own out-of-order guard below — not exported further than this file needs, since no other caller has a legitimate reason to fetch one subscription row by its Stripe id directly (every other read goes through listSubscriptionsForUser()). */
async function getSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<PlatformSubscriptionRow | null> {
  const { data, error } = await supabaseAdmin.from(SUBSCRIPTIONS_TABLE).select("*").eq("stripe_subscription_id", stripeSubscriptionId).maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} Existing-subscription lookup failed, proceeding as if none exists`, error);
    return null;
  }

  return (data as PlatformSubscriptionRow) ?? null;
}

export async function saveCustomer(input: { userId: string; stripeCustomerId: string; email: string | null }): Promise<PlatformBillingCustomer> {
  const { data, error } = await supabaseAdmin
    .from(CUSTOMERS_TABLE)
    .upsert(
      { user_id: input.userId, stripe_customer_id: input.stripeCustomerId, email: input.email, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Customer Saved`, { userId: input.userId });

  return data as PlatformBillingCustomer;
}

export interface PlatformSubscriptionRow {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  plan_id: StripeBackedPlanKey;
  status: PlatformSubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Every subscription row for a user, regardless of status — callers apply their own status policy (entitlement-service.ts's isPaidAccessStatus()), never filtered here, so this stays the single honest source of "what does Stripe say exists" without baking in an access decision. */
export async function listSubscriptionsForUser(userId: string): Promise<PlatformSubscriptionRow[]> {
  const { data, error } = await supabaseAdmin.from(SUBSCRIPTIONS_TABLE).select("*").eq("user_id", userId);

  if (error) {
    console.error(`${LOG_PREFIX} Subscription lookup failed, treating as none`, error);
    return [];
  }

  return (data ?? []) as PlatformSubscriptionRow[];
}

/**
 * Upserted by stripe_subscription_id — the same real Stripe id every
 * webhook event for this subscription carries, so replaying an event
 * (or receiving created→updated→updated for the same subscription) is
 * naturally idempotent: it just re-writes the same row (Step 9).
 *
 * Phase 18 Milestone 6 — Stripe does not guarantee webhook delivery
 * ORDER (a separate concern from duplicate delivery, already handled
 * by the upsert-by-id above): a delayed `customer.subscription.updated`
 * carrying an OLDER snapshot could otherwise arrive and overwrite a
 * newer one, e.g. transiently reverting a just-renewed subscription
 * back to a stale `past_due` status. Guarded here by repurposing the
 * existing `updated_at` column to record the STRIPE EVENT's own
 * `created` timestamp (eventCreatedAt) rather than this row's wall-
 * clock write time — no new column/migration needed, since nothing
 * else in this codebase treats `updated_at` as "the moment this row
 * was physically written" (pickBestSubscriptionForRole() only ever
 * uses it to compare which of two SIBLING subscriptions is more
 * current, which this makes MORE correct, not less: it now compares by
 * Stripe's own authoritative event clock instead of by webhook-
 * processing race timing). If a row already exists for this
 * stripe_subscription_id with an equal-or-newer eventCreatedAt, this
 * incoming event is stale and is skipped entirely — logged, not
 * thrown, since an out-of-order delivery is an expected Stripe
 * behavior, not an error. Read-then-write, not a single atomic
 * statement — a fully race-proof version would need a DB-level
 * conditional write, judged unnecessary complexity for the actual risk
 * (near-simultaneous deliveries for the very same subscription are
 * rare, and the worst case of losing this race is identical to today's
 * pre-existing behavior, never worse).
 */
export async function upsertSubscription(input: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  planId: StripeBackedPlanKey;
  status: PlatformSubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  /** The Stripe event's own `created` time (ISO) — never wall-clock `Date.now()` — see the out-of-order guard above. */
  eventCreatedAt: string;
}): Promise<PlatformSubscriptionRow> {
  const existing = await getSubscriptionByStripeSubscriptionId(input.stripeSubscriptionId);

  if (existing && existing.updated_at >= input.eventCreatedAt) {
    console.warn(`${LOG_PREFIX} Ignoring out-of-order/stale webhook event for an already-newer subscription row`, {
      stripeSubscriptionId: input.stripeSubscriptionId,
      existingUpdatedAt: existing.updated_at,
      incomingEventCreatedAt: input.eventCreatedAt,
    });
    return existing;
  }

  const { data, error } = await supabaseAdmin
    .from(SUBSCRIPTIONS_TABLE)
    .upsert(
      {
        user_id: input.userId,
        stripe_customer_id: input.stripeCustomerId,
        stripe_subscription_id: input.stripeSubscriptionId,
        stripe_price_id: input.stripePriceId,
        plan_id: input.planId,
        status: input.status,
        current_period_start: input.currentPeriodStart,
        current_period_end: input.currentPeriodEnd,
        cancel_at_period_end: input.cancelAtPeriodEnd,
        canceled_at: input.canceledAt,
        updated_at: input.eventCreatedAt,
      },
      { onConflict: "stripe_subscription_id" }
    )
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Subscription Upserted`, { userId: input.userId, planId: input.planId, status: input.status });

  return data as PlatformSubscriptionRow;
}

// ---------------------------------------------------------------------------
// Step 11 — deterministic Stripe-status → entitlement policy.
// ---------------------------------------------------------------------------

/**
 * The exact, documented policy (PHASE18_MILESTONE2_STRIPE_BILLING.md,
 * "Subscription-state mapping"): `active`/`trialing` obviously grant
 * paid access. `past_due` ALSO still grants paid access — a deliberate,
 * common SaaS choice (Stripe is still retrying the card; punishing a
 * transient payment hiccup by instantly downgrading is harsher than
 * necessary) rather than a guess. `canceled`/`unpaid`/`incomplete`/
 * `incomplete_expired` never grant paid access — an incomplete
 * subscription never successfully started, and a canceled/unpaid one
 * has definitively ended.
 */
export function isPaidAccessStatus(status: PlatformSubscriptionStatus): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

/**
 * Pure — takes an already-fetched row list (entitlement-service.ts's
 * resolveEffectivePlans() fetches once for however many roles a user
 * has, rather than once per role) and picks the user's most-recent
 * paid-access subscription in `role`'s plan family (Step 3:
 * independent-of-persona billing means a user could hold subscriptions
 * in more than one family — this only ever looks at the one relevant to
 * the role being resolved). Returns null (→ the caller falls back to
 * the role's FREE default) whenever no row is in that family, every row
 * in it is in a non-paid-access status — "fail closed for paid
 * entitlements" (Step 10) for the actual decision logic; the fetch
 * itself failing closed happens in listSubscriptionsForUser() above.
 */
export function pickBestSubscriptionForRole(subscriptions: PlatformSubscriptionRow[], role: PlatformRole): PlatformSubscriptionRow | null {
  const familyPrefix = role === "JOB_SEEKER" ? "JOB_SEEKER_" : role === "RECRUITER" ? "RECRUITER_" : null;
  if (!familyPrefix) return null; // ADMIN has no plan family at all

  const inFamily = subscriptions.filter((row) => row.plan_id.startsWith(familyPrefix) && isPaidAccessStatus(row.status));
  if (inFamily.length === 0) return null;

  // If more than one paid-access row exists in the same family (should
  // be rare — application-level checkout guards against creating a
  // second one — but two could theoretically overlap during a plan
  // change), the most recently updated one wins, never both merged.
  return inFamily.reduce((latest, row) => (row.updated_at > latest.updated_at ? row : latest));
}

/** Convenience single-role wrapper for callers (platform-billing-service.ts's checkout duplicate-guard) that only ever need one role's answer and don't already have a fetched list. */
export async function resolveStripeBackedPlan(userId: string, role: PlatformRole): Promise<PlatformSubscriptionRow | null> {
  const subscriptions = await listSubscriptionsForUser(userId);
  return pickBestSubscriptionForRole(subscriptions, role);
}

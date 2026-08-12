import { supabaseAdmin } from "../supabase/admin";
import { listPlans } from "../billing/plan-service";
import { organizationService } from "../saas/organization-service";
import { PlanKey } from "../billing/billing-schema";

import { ChurnMetrics, DateRange, Metric, SubscriptionCounts, SubscriptionMetrics } from "./analytics-types";
import { getCurrentMrrArr } from "./revenue-analytics";

const LOG_PREFIX = "[analytics]";

export interface SubscriptionRow {
  organization_id: string;
  plan_id: string;
  billing_interval: "monthly" | "yearly";
  status: string;
  trial_end: string | null;
  grace_period_end: string | null;
  created_at: string;
  updated_at: string;
}

const ACTIVE_ISH_STATUSES = ["active", "trialing", "past_due", "grace_period"];

/** Every subscriptions row, unfiltered by status — the only place this table is read whole. Exported for conversion-analytics.ts (trial→paid needs trial_end) rather than re-querying. */
export async function fetchAllSubscriptions(): Promise<SubscriptionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("organization_id, plan_id, billing_interval, status, trial_end, grace_period_end, created_at, updated_at");

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "subscriptions", error: error.message });
    return [];
  }

  return data ?? [];
}

/** Same expiry rule as subscription-service.ts's isExpiredPastGrace() (protected, not imported directly to avoid an N+1 per-organization DB round trip here) — a canceled subscription, or one past its grace_period_end. */
function isExpired(row: SubscriptionRow): boolean {
  if (row.status === "canceled") return true;
  return row.grace_period_end ? new Date(row.grace_period_end).getTime() < Date.now() : false;
}

/** organizationId -> current plan key, for every organization that HAS a subscriptions row and is in an active-ish state. Callers (user-analytics.ts, organization-analytics.ts) treat any id missing from this map as "free" — no row = implicit Free plan. */
export async function getOrganizationPlanMap(): Promise<Map<string, PlanKey>> {
  const [subscriptions, plans] = await Promise.all([fetchAllSubscriptions(), listPlans()]);
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const result = new Map<string, PlanKey>();

  for (const sub of subscriptions) {
    if (!ACTIVE_ISH_STATUSES.includes(sub.status)) continue;
    const plan = planById.get(sub.plan_id);
    if (plan) result.set(sub.organization_id, plan.key);
  }

  return result;
}

const PLAN_RANK: Record<PlanKey, number> = { free: 0, professional: 1, premium: 2, enterprise: 3 };

/** Ties a user to the highest-tier plan among the organizations they belong to — the defensible tie-break for a user who's a member of multiple orgs on different plans. */
export function highestPlan(planKeys: PlanKey[]): PlanKey {
  return planKeys.reduce((highest, key) => (PLAN_RANK[key] > PLAN_RANK[highest] ? key : highest), "free" as PlanKey);
}

export async function getSubscriptionMetrics(range: DateRange): Promise<SubscriptionMetrics> {
  const [subscriptions, plans, organizations] = await Promise.all([fetchAllSubscriptions(), listPlans(), organizationService.listAll()]);
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const byPlan: SubscriptionCounts = { free: 0, professional: 0, premium: 0, enterprise: 0 };
  let activeSubscriptions = 0;
  let trials = 0;
  let expiredSubscriptions = 0;
  let cancellationsInRange = 0;

  const orgsWithSubscriptionRow = new Set<string>();

  for (const sub of subscriptions) {
    orgsWithSubscriptionRow.add(sub.organization_id);
    const plan = planById.get(sub.plan_id);

    if (ACTIVE_ISH_STATUSES.includes(sub.status)) {
      activeSubscriptions += 1;
      if (plan) byPlan[plan.key as Exclude<PlanKey, "free">] += 1;
    }

    if (sub.status === "trialing") trials += 1;
    if (isExpired(sub)) expiredSubscriptions += 1;

    if (sub.status === "canceled") {
      const updatedAt = new Date(sub.updated_at).getTime();
      if (updatedAt >= range.from.getTime() && updatedAt <= range.to.getTime()) {
        cancellationsInRange += 1;
      }
    }
  }

  // An organization with no subscriptions row at all is on the
  // implicit Free plan (subscription-service.ts's own fallback rule —
  // no row is ever written for Free) — so Free count is derived, not
  // read from a table.
  byPlan.free = Math.max(0, organizations.length - orgsWithSubscriptionRow.size);

  const notAvailable = (reason: string): Metric<number> => ({ available: false, reason });
  const seeConversionTab = notAvailable("See the Conversion tab (getConversionMetrics()) — computed once there to avoid two dashboards showing different numbers for the same metric.");

  return {
    byPlan,
    activeSubscriptions,
    trials,
    cancellationsInRange,
    expiredSubscriptions,
    // No subscription-history/event log exists (subscriptions is a
    // current-state table only — see supabase/migrations/
    // 20260808000000_add_billing_tables.sql), so a plan change can't be
    // distinguished from "always was on this plan" after the fact.
    upgrades: notAvailable("Subscriptions only store current state, not a change history — an upgrade can't be distinguished from 'always on this plan' after the fact."),
    downgrades: notAvailable("Subscriptions only store current state, not a change history."),
    renewals: notAvailable("Subscriptions only store current state, not a change history — a renewal leaves no distinct trace from the subscription simply still being active."),
    planConversion: {
      freeToPaid: seeConversionTab,
      trialToPaid: seeConversionTab,
      professionalToPremium: seeConversionTab,
      premiumToEnterprise: seeConversionTab,
    },
  };
}

export async function getChurnMetrics(range: DateRange): Promise<ChurnMetrics> {
  const [subscriptions, plans] = await Promise.all([fetchAllSubscriptions(), listPlans()]);
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  let canceledInRange = 0;
  let canceledMonthlyEquivalentCents = 0;
  let activeBase = 0;

  for (const sub of subscriptions) {
    if (ACTIVE_ISH_STATUSES.includes(sub.status)) {
      activeBase += 1;
      continue;
    }

    if (sub.status === "canceled") {
      const updatedAt = new Date(sub.updated_at).getTime();
      if (updatedAt >= range.from.getTime() && updatedAt <= range.to.getTime()) {
        canceledInRange += 1;

        const plan = planById.get(sub.plan_id);
        if (plan) {
          canceledMonthlyEquivalentCents += sub.billing_interval === "yearly" ? Math.round(plan.yearly_price_cents / 12) : plan.monthly_price_cents;
        }
      }
    }
  }

  const base = activeBase + canceledInRange;
  const formula =
    "Customer/subscription churn = canceled-in-range ÷ (currently-active + canceled-in-range). " +
    "'Canceled-in-range' is approximated from subscriptions.updated_at (the row's last-modified timestamp), " +
    "not a true point-in-time cohort snapshot, because no subscription-history log exists yet. " +
    "Revenue churn = MRR value of subscriptions canceled in range ÷ (current MRR + that same lost amount), " +
    "approximating 'MRR at the start of the range' since no historical MRR snapshots are stored.";

  if (base === 0) {
    const reason = "No active or canceled subscriptions exist yet to compute a churn rate from.";
    return {
      customerChurnRate: { available: false, reason },
      subscriptionChurnRate: { available: false, reason },
      revenueChurn: { available: false, reason },
      canceledInRange,
      formula,
    };
  }

  const rate = canceledInRange / base;
  // This product enforces exactly one subscription per organization
  // (unique(organization_id) on the subscriptions table) — so "customer"
  // and "subscription" churn are definitionally the same number here,
  // not two independently-measured rates.
  const customerAndSubscriptionChurn: Metric<number> = { available: true, value: rate };

  let revenueChurn: Metric<number> = { available: false, reason: "No canceled subscription in this range had a paid plan attached." };

  if (canceledMonthlyEquivalentCents > 0) {
    const { mrrCents: currentMrrCents } = await getCurrentMrrArr();
    // "MRR at the start of the range" isn't stored anywhere (no
    // historical MRR snapshots), so it's approximated as current MRR
    // plus whatever was lost to cancellations in this range.
    const startingMrrCents = currentMrrCents + canceledMonthlyEquivalentCents;
    revenueChurn = { available: true, value: canceledMonthlyEquivalentCents / startingMrrCents };
  }

  return {
    customerChurnRate: customerAndSubscriptionChurn,
    subscriptionChurnRate: customerAndSubscriptionChurn,
    revenueChurn,
    canceledInRange,
    formula,
  };
}

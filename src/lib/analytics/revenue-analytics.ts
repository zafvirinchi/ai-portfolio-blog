import { supabaseAdmin } from "../supabase/admin";
import { listPlans } from "../billing/plan-service";
import { organizationService } from "../saas/organization-service";
import { PlanKey } from "../billing/billing-schema";

import { DateRange, RevenueMetrics } from "./analytics-types";

const LOG_PREFIX = "[analytics]";
const MAX_ROWS = 20_000;

interface PaymentRow {
  organization_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
}

async function fetchPayments(range: DateRange): Promise<PaymentRow[]> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("organization_id, amount_cents, currency, status, created_at")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .limit(MAX_ROWS);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "payments", error: error.message });
    return [];
  }

  return data ?? [];
}

async function fetchPaidInvoiceTotals(range: DateRange): Promise<{ taxCents: number; discountCents: number }> {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("tax_cents, discount_cents")
    .eq("status", "paid")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .limit(MAX_ROWS);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "invoices", error: error.message });
    return { taxCents: 0, discountCents: 0 };
  }

  return (data ?? []).reduce(
    (acc, row) => ({ taxCents: acc.taxCents + (row.tax_cents ?? 0), discountCents: acc.discountCents + (row.discount_cents ?? 0) }),
    { taxCents: 0, discountCents: 0 }
  );
}

interface ActiveSubscriptionRow {
  organization_id: string;
  plan_id: string;
  billing_interval: "monthly" | "yearly";
  status: string;
}

async function fetchActiveSubscriptions(): Promise<ActiveSubscriptionRow[]> {
  // MRR/ARR are point-in-time snapshots (standard SaaS metric
  // practice — not date-range-scoped, since a subscription's "current"
  // recurring value doesn't retroactively change), computed from
  // whatever is active right now regardless of the caller's selected
  // range. past_due/grace_period subscriptions are still counted —
  // they represent revenue the org is still contractually on the hook
  // for, distinct from a canceled subscription.
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("organization_id, plan_id, billing_interval, status")
    .in("status", ["active", "trialing", "past_due", "grace_period"]);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "subscriptions", error: error.message });
    return [];
  }

  return data ?? [];
}

/** MRR from currently-active recurring subscriptions only — never a sum of historical payments (which would double-count renewals and include one-time noise). ARR = MRR × 12. */
export async function getCurrentMrrArr(): Promise<{ mrrCents: number; arrCents: number; byPlan: RevenueMetrics["revenueByPlan"] }> {
  const [subscriptions, plans] = await Promise.all([fetchActiveSubscriptions(), listPlans()]);
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  let mrrCents = 0;
  const byPlan = new Map<PlanKey, { planName: string; mrrCents: number; subscriptions: number }>();

  for (const sub of subscriptions) {
    const plan = planById.get(sub.plan_id);
    if (!plan) continue;

    const monthlyEquivalent = sub.billing_interval === "yearly" ? Math.round(plan.yearly_price_cents / 12) : plan.monthly_price_cents;
    mrrCents += monthlyEquivalent;

    const entry = byPlan.get(plan.key) ?? { planName: plan.name, mrrCents: 0, subscriptions: 0 };
    entry.mrrCents += monthlyEquivalent;
    entry.subscriptions += 1;
    byPlan.set(plan.key, entry);
  }

  return {
    mrrCents,
    arrCents: mrrCents * 12,
    byPlan: [...byPlan.entries()].map(([planKey, v]) => ({ planKey, ...v })),
  };
}

export async function getRevenueMetrics(range: DateRange): Promise<RevenueMetrics> {
  const [payments, invoiceTotals, mrrArr, organizations] = await Promise.all([
    fetchPayments(range),
    fetchPaidInvoiceTotals(range),
    getCurrentMrrArr(),
    organizationService.listAll(),
  ]);

  const organizationNameById = new Map(organizations.map((org) => [org.id, org.name]));

  let grossRevenueCents = 0;
  let refundsCents = 0;
  let failedPaymentsCents = 0;
  let failedPaymentsCount = 0;

  const byDay = new Map<string, { grossCents: number; refundsCents: number }>();
  const byOrganization = new Map<string, number>();

  for (const payment of payments) {
    const day = payment.created_at.slice(0, 10);
    const dayEntry = byDay.get(day) ?? { grossCents: 0, refundsCents: 0 };

    if (payment.status === "succeeded") {
      grossRevenueCents += payment.amount_cents;
      dayEntry.grossCents += payment.amount_cents;
      byOrganization.set(payment.organization_id, (byOrganization.get(payment.organization_id) ?? 0) + payment.amount_cents);
    } else if (payment.status === "refunded") {
      refundsCents += payment.amount_cents;
      dayEntry.refundsCents += payment.amount_cents;
    } else if (payment.status === "failed") {
      failedPaymentsCents += payment.amount_cents;
      failedPaymentsCount += 1;
    }

    byDay.set(day, dayEntry);
  }

  return {
    grossRevenueCents,
    netRevenueCents: grossRevenueCents - refundsCents,
    // This product has no one-time-purchase feature today (every
    // payment originates from a subscription checkout or renewal
    // invoice) — so all recognized revenue is recurring by
    // construction, not an assumption. Revisit this split if a
    // one-time-purchase feature is ever added.
    recurringRevenueCents: grossRevenueCents,
    oneTimeRevenueCents: 0,
    refundsCents,
    discountsCents: invoiceTotals.discountCents,
    taxesCents: invoiceTotals.taxCents,
    failedPaymentsCents,
    failedPaymentsCount,
    mrrCents: mrrArr.mrrCents,
    arrCents: mrrArr.arrCents,
    revenueTrend: [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
    revenueByPlan: mrrArr.byPlan,
    revenueByOrganization: [...byOrganization.entries()]
      .map(([organizationId, totalCents]) => ({ organizationId, organizationName: organizationNameById.get(organizationId) ?? "Unknown", totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents),
  };
}

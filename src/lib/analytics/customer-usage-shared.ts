import { DateRangePreset, resolveDateRange } from "./analytics-schema";
import { DateRange } from "./analytics-types";
import { ResolvedSubscription } from "../billing/billing-types";

/**
 * Pure, I/O-free pieces of the customer usage-analytics domain — date-
 * range resolution and the credit limit-warning thresholds. Split out
 * from customer-analytics-service.ts specifically so client components
 * (CreditBalanceCard, /billing/page.tsx, etc.) can import
 * getUsageLimitWarning() directly without pulling in that file's
 * server-only dependencies (supabaseAdmin, next/headers via
 * tenant-context.ts) into the browser bundle. Next.js has no way to
 * tree-shake a "use client" file's transitive imports of server-only
 * modules — importing the wrong file here is a build-time/runtime
 * error, not just a style issue. customer-analytics-service.ts
 * re-exports everything in this file for server-side callers, so
 * routes only ever need one import.
 */

// ---------------------------------------------------------------------------
// Date range — 7d/30d/90d reuse Milestone 5's exact resolveDateRange()
// (same day-boundary semantics, not silently redefined), plus a
// "billing_period" option genuinely new to this milestone. Deliberately
// NOT Milestone 5's 9-preset/custom-range schema — normal customers get
// exactly these 4 choices, never an arbitrary date range (the spec's
// own "do not allow unlimited arbitrary date ranges from normal users"
// rule).
// ---------------------------------------------------------------------------

export const CUSTOMER_RANGE_PRESETS = ["7d", "30d", "90d", "billing_period"] as const;
export type CustomerRangePreset = (typeof CUSTOMER_RANGE_PRESETS)[number];

const CUSTOMER_TO_ADMIN_PRESET: Record<Exclude<CustomerRangePreset, "billing_period">, DateRangePreset> = {
  "7d": "last_7_days",
  "30d": "last_30_days",
  "90d": "last_90_days",
};

export interface CustomerDateRange extends DateRange {
  /**
   * true only when this window was derived from the subscription's own
   * current_period_end/billing_interval (a real Stripe billing cycle).
   * false for 7d/30d/90d and for the calendar-month fallback used when
   * no real billing cycle exists yet (Free plan, or a paid subscription
   * whose period end isn't set). See PHASE14_MILESTONE6 docs, Billing
   * Period, for why this can differ from the AI credit pool's own
   * (protected, calendar-month) reset date.
   */
  isRealBillingCycle: boolean;
}

/**
 * Resolves "Current Billing Period" from the subscription's real
 * current_period_end and billing_interval where available — never
 * assumes "1st of month" for a customer with an actual paid,
 * mid-cycle subscription. Falls back to calendar month (the same
 * boundary the protected AI credit engine itself uses) only when no
 * real billing cycle exists: a Free-plan organization, or a paid
 * subscription that hasn't recorded a period end yet.
 */
export function resolveCustomerDateRange(preset: CustomerRangePreset, subscription: ResolvedSubscription): CustomerDateRange {
  if (preset !== "billing_period") {
    return { ...resolveDateRange({ range: CUSTOMER_TO_ADMIN_PRESET[preset] }), isRealBillingCycle: false };
  }

  const now = new Date();

  if (subscription.isImplicitFree || !subscription.current_period_end) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { preset: "custom", from, to: now, isRealBillingCycle: false };
  }

  const periodEnd = new Date(subscription.current_period_end);
  const periodStart = new Date(periodEnd);

  if (subscription.billing_interval === "yearly") {
    periodStart.setFullYear(periodStart.getFullYear() - 1);
  } else {
    periodStart.setMonth(periodStart.getMonth() - 1);
  }

  return { preset: "custom", from: periodStart, to: now < periodEnd ? now : periodEnd, isRealBillingCycle: true };
}

// ---------------------------------------------------------------------------
// Usage limit warnings — the 4 thresholds the spec names, with its own
// exact copy for 75/90/100 (50% given equivalent, honest wording).
// Returns null for an unlimited plan (no limit exists to warn about)
// and for anything under 50%.
// ---------------------------------------------------------------------------

export interface UsageLimitWarning {
  threshold: 50 | 75 | 90 | 100;
  message: string;
}

export function getUsageLimitWarning(usagePercent: number | null): UsageLimitWarning | null {
  if (usagePercent === null) return null;
  if (usagePercent >= 100) return { threshold: 100, message: "You have reached your monthly AI credit limit." };
  if (usagePercent >= 90) return { threshold: 90, message: "You are approaching your monthly AI credit limit." };
  if (usagePercent >= 75) return { threshold: 75, message: "You have used most of your monthly AI credits." };
  if (usagePercent >= 50) return { threshold: 50, message: "You have used half of your monthly AI credits." };
  return null;
}

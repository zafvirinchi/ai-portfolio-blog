import { BillingInterval } from "./billing-schema";
import { Plan } from "./billing-types";

export function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export function priceForInterval(plan: Plan, interval: BillingInterval): number {
  return interval === "yearly" ? plan.yearly_price_cents : plan.monthly_price_cents;
}

/** Yearly plans are priced as a discount vs. paying monthly for 12 months — this is the % saved, for display on the pricing toggle. */
export function yearlySavingsPercent(plan: Plan): number {
  if (plan.monthly_price_cents === 0) return 0;

  const monthlyAnnualized = plan.monthly_price_cents * 12;
  if (monthlyAnnualized === 0) return 0;

  return Math.round(((monthlyAnnualized - plan.yearly_price_cents) / monthlyAnnualized) * 100);
}

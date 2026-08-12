import { describe, expect, it } from "vitest";

import { getUsageLimitWarning, resolveCustomerDateRange } from "./customer-usage-shared";
import type { ResolvedSubscription } from "../billing/billing-types";

function makeSubscription(overrides: Partial<ResolvedSubscription> = {}): ResolvedSubscription {
  return {
    id: "sub-1",
    organization_id: "org-1",
    plan_id: "plan-1",
    status: "active",
    billing_interval: "monthly",
    provider: "stripe",
    provider_customer_id: null,
    provider_subscription_id: null,
    current_period_end: null,
    trial_end: null,
    cancel_at: null,
    grace_period_end: null,
    created_at: "",
    updated_at: "",
    plan: { id: "plan-1", key: "professional", name: "Professional", monthly_price_cents: 1900, yearly_price_cents: 19000, limits: {} as never, priority_support: false, api_access: false, created_at: "" },
    isImplicitFree: false,
    ...overrides,
  };
}

describe("resolveCustomerDateRange", () => {
  it("7d/30d/90d reuse Milestone 5's exact day-boundary semantics and are never flagged as a real billing cycle", () => {
    const subscription = makeSubscription();

    for (const preset of ["7d", "30d", "90d"] as const) {
      const range = resolveCustomerDateRange(preset, subscription);
      expect(range.isRealBillingCycle).toBe(false);
      expect(range.from.getTime()).toBeLessThan(range.to.getTime());
    }
  });

  it("billing_period uses the subscription's real current_period_end and billing_interval when available", () => {
    const periodEnd = new Date("2026-02-15T00:00:00.000Z");
    const subscription = makeSubscription({ current_period_end: periodEnd.toISOString(), billing_interval: "monthly" });

    const range = resolveCustomerDateRange("billing_period", subscription);

    expect(range.isRealBillingCycle).toBe(true);
    // Period start = period end minus 1 month, exactly — never "1st of month".
    expect(range.from.getUTCMonth()).toBe((periodEnd.getUTCMonth() + 11) % 12);
    expect(range.from.getUTCDate()).toBe(periodEnd.getUTCDate());
  });

  it("billing_period subtracts a full year for yearly billing intervals", () => {
    const periodEnd = new Date("2026-06-01T00:00:00.000Z");
    const subscription = makeSubscription({ current_period_end: periodEnd.toISOString(), billing_interval: "yearly" });

    const range = resolveCustomerDateRange("billing_period", subscription);

    expect(range.from.getUTCFullYear()).toBe(periodEnd.getUTCFullYear() - 1);
  });

  it("billing_period falls back to the calendar month (never 'isRealBillingCycle') for an implicit Free plan", () => {
    const subscription = makeSubscription({ isImplicitFree: true, current_period_end: null });
    const range = resolveCustomerDateRange("billing_period", subscription);

    expect(range.isRealBillingCycle).toBe(false);
    expect(range.from.getDate()).toBe(1);
  });

  it("billing_period falls back to the calendar month for a paid subscription with no recorded period end", () => {
    const subscription = makeSubscription({ isImplicitFree: false, current_period_end: null });
    const range = resolveCustomerDateRange("billing_period", subscription);

    expect(range.isRealBillingCycle).toBe(false);
  });

  it("billing_period never extends into the future — 'to' is capped at now even if current_period_end hasn't arrived yet", () => {
    const farFuture = new Date(Date.now() + 30 * 86_400_000);
    const subscription = makeSubscription({ current_period_end: farFuture.toISOString() });

    const range = resolveCustomerDateRange("billing_period", subscription);

    expect(range.to.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe("getUsageLimitWarning", () => {
  it("returns null for an unlimited plan — never warns about a limit the customer doesn't have", () => {
    expect(getUsageLimitWarning(null)).toBeNull();
  });

  it("returns null under 50%", () => {
    expect(getUsageLimitWarning(49)).toBeNull();
  });

  it.each([
    [50, 50],
    [74, 50],
    [75, 75],
    [89, 75],
    [90, 90],
    [99, 90],
    [100, 100],
    [150, 100],
  ])("classifies %i%% under the %i%% threshold", (percent, expectedThreshold) => {
    expect(getUsageLimitWarning(percent)?.threshold).toBe(expectedThreshold);
  });

  it("uses the spec's exact wording at 75/90/100", () => {
    expect(getUsageLimitWarning(75)?.message).toBe("You have used most of your monthly AI credits.");
    expect(getUsageLimitWarning(90)?.message).toBe("You are approaching your monthly AI credit limit.");
    expect(getUsageLimitWarning(100)?.message).toBe("You have reached your monthly AI credit limit.");
  });
});

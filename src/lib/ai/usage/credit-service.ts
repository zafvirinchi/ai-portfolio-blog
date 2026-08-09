import { supabaseAdmin } from "../../supabase/admin";
import { getActiveSubscription } from "../../billing/subscription-service";

import { UsageFeatureKey } from "./usage-schema";
import { InsufficientAiCreditsError, UsageReservationError } from "./usage-errors";
import { UsageBalance } from "./usage-types";
import { MONTHLY_CREDIT_ALLOWANCE } from "./usage-policy";

const LOG_PREFIX = "[ai-usage]";

// The atomic layer — every function here is a single supabaseAdmin.rpc()
// call into one of the 3 Postgres functions from this milestone's
// migration, each a single UPDATE ... RETURNING statement (atomic in
// Postgres without an explicit transaction block). This is the ONLY
// place in the app that calls those functions; usage-service.ts is the
// only caller of this file.
//
// The pool itself is ONE row per (organization, calendar month) —
// shared across every feature, matching "Each plan owns monthly AI
// credits" (a singular pool) rather than fragmenting it per feature.
// `feature` is still threaded through here only for the error message/
// logging context — per-feature breakdowns live in
// credit_transactions/usage_tracking (which do carry feature_key), not
// in the pool's own identity.

function periodStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function resolveMonthlyLimit(organizationId: string): Promise<number | null> {
  const subscription = await getActiveSubscription(organizationId);
  return MONTHLY_CREDIT_ALLOWANCE[subscription.plan.key];
}

export interface ReserveResult {
  reserved: number;
  consumed: number;
  monthlyLimit: number | null;
}

/** Throws InsufficientAiCreditsError (never a generic Error) when the pool is exhausted — the only rejection path callers need to special-case. */
export async function reserve(organizationId: string, feature: UsageFeatureKey, amount: number): Promise<ReserveResult> {
  const monthlyLimit = await resolveMonthlyLimit(organizationId);
  const periodStart = periodStartIso();

  const { data, error } = await supabaseAdmin.rpc("ai_credits_reserve", {
    p_organization_id: organizationId,
    p_period_start: periodStart,
    p_monthly_limit: monthlyLimit,
    p_amount: amount,
  });

  if (error) {
    throw new UsageReservationError(`Credit reservation failed: ${error.message}`, error);
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new UsageReservationError("Credit reservation returned no row");
  }

  console.log(`${LOG_PREFIX} Credits reserved`, { organizationId, feature, amount, allowed: row.allowed });

  if (!row.allowed) {
    const currentBalance = monthlyLimit === null ? Infinity : Math.max(0, monthlyLimit - row.reserved - row.consumed);
    throw new InsufficientAiCreditsError(feature, currentBalance, amount, true);
  }

  return { reserved: row.reserved, consumed: row.consumed, monthlyLimit: row.monthly_limit };
}

export async function commit(organizationId: string, feature: UsageFeatureKey, reservedAmount: number, actualAmount: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("ai_credits_commit", {
    p_organization_id: organizationId,
    p_period_start: periodStartIso(),
    p_reserved_amount: reservedAmount,
    p_actual_amount: actualAmount,
  });

  if (error) {
    console.error(`${LOG_PREFIX} Credits commit failed`, error);
    return;
  }

  console.log(`${LOG_PREFIX} Credits committed`, { organizationId, feature, actualAmount });
}

export async function release(organizationId: string, feature: UsageFeatureKey, amount: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("ai_credits_release", {
    p_organization_id: organizationId,
    p_period_start: periodStartIso(),
    p_amount: amount,
  });

  if (error) {
    console.error(`${LOG_PREFIX} Credits release failed`, error);
    return;
  }

  console.log(`${LOG_PREFIX} Credits released`, { organizationId, feature, amount });
}

export async function getBalance(organizationId: string): Promise<UsageBalance> {
  const monthlyLimit = await resolveMonthlyLimit(organizationId);
  const periodStart = periodStartIso();

  const { data } = await supabaseAdmin
    .from("credit_balances")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("period_start", periodStart)
    .maybeSingle();

  const reserved = data?.reserved ?? 0;
  const consumed = data?.consumed ?? 0;
  const remaining = monthlyLimit === null ? null : Math.max(0, monthlyLimit - reserved - consumed);
  const resetDate = new Date(new Date(periodStart).getTime());
  resetDate.setUTCMonth(resetDate.getUTCMonth() + 1);

  return {
    feature: "TOTAL",
    monthlyLimit,
    reserved,
    consumed,
    remaining,
    usagePercent: monthlyLimit && monthlyLimit > 0 ? Math.min(100, Math.round(((reserved + consumed) / monthlyLimit) * 100)) : null,
    periodStart,
    resetDate: resetDate.toISOString(),
  };
}

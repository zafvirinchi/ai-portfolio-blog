import { supabaseAdmin } from "../supabase/admin";
import { getTenantContext, organizationRequestContext } from "../saas/tenant-context";

import { FeatureKey } from "./billing-schema";
import { CreditBalance, CreditTransaction, InsufficientCreditsError, UsageTrackingEntry } from "./billing-types";
import { getActiveSubscription, isExpiredPastGrace } from "./subscription-service";
import { PLAN_DEFINITIONS } from "./plan-service";

const LOG_PREFIX = "[billing]";
const LOW_CREDIT_WARNING_THRESHOLD = 0.2;

/**
 * organizationRequestContext is only populated inside the chat request
 * chain (see /api/ai/chat/route.ts) — every other AI route calls
 * checkCredits()/consumeCredits() directly, with no AsyncLocalStorage
 * wrapping of its own, so this falls back to a fresh getTenantContext()
 * call (cookie + Supabase session, same as every other Milestone 1/2
 * read) whenever there's no active store.
 */
async function resolveOrganizationId(): Promise<string | null> {
  const fromStore = organizationRequestContext.getStore()?.organizationId;
  if (fromStore) return fromStore;

  const context = await getTenantContext();
  return context?.organizationId ?? null;
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function usedThisMonth(organizationId: string, featureKey: FeatureKey): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("feature_key", featureKey)
    .gte("created_at", startOfMonthIso());

  if (error) {
    // e.g. the usage_tracking table not existing yet (pre-migration) —
    // treat as zero usage rather than breaking every AI feature for
    // every organization.
    console.error(`${LOG_PREFIX} Usage lookup failed, treating as zero`, error);
    return 0;
  }

  return count ?? 0;
}

export async function getCreditBalance(organizationId: string, featureKey: FeatureKey): Promise<CreditBalance> {
  const subscription = await getActiveSubscription(organizationId);
  const limit = isExpiredPastGrace(subscription) ? PLAN_DEFINITIONS.free.limits[featureKey] : subscription.plan.limits[featureKey];
  const used = await usedThisMonth(organizationId, featureKey);

  return { featureKey, limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
}

export async function listCreditBalances(organizationId: string): Promise<CreditBalance[]> {
  const featureKeys = Object.keys(PLAN_DEFINITIONS.free.limits).filter(
    (key): key is FeatureKey => key !== "organization_seats" && key !== "storage_mb"
  ) as FeatureKey[];

  return Promise.all(featureKeys.map((featureKey) => getCreditBalance(organizationId, featureKey)));
}

/**
 * Pure no-op — resolves silently and allows the request through —
 * whenever there's no resolvable organization (every anonymous request
 * today, and every logged-in user with no organization). Only throws
 * when a real organization context exists AND its plan's monthly
 * allotment for this feature is exhausted. Never called for features
 * without a meaningful per-request cost.
 */
export async function checkCredits(featureKey: FeatureKey): Promise<void> {
  const organizationId = await resolveOrganizationId();
  if (!organizationId) return;

  const balance = await getCreditBalance(organizationId, featureKey);
  if (balance.limit === null) return; // unlimited

  if (balance.used >= balance.limit) {
    throw new InsufficientCreditsError(featureKey, balance.limit, balance.used);
  }

  if (balance.remaining !== null && balance.limit > 0 && balance.remaining / balance.limit <= LOW_CREDIT_WARNING_THRESHOLD) {
    console.log(`${LOG_PREFIX} Low Credit Warning`, { organizationId, featureKey, remaining: balance.remaining, limit: balance.limit });
  }
}

/** No-op for the same reasons as checkCredits() — only writes when a real organization context exists. Never throws (a logging failure should never break the feature it's metering). */
export async function consumeCredits(featureKey: FeatureKey, durationMs?: number, userId?: string | null): Promise<void> {
  const organizationId = await resolveOrganizationId();
  if (!organizationId) return;

  try {
    const balance = await getCreditBalance(organizationId, featureKey);
    const balanceAfter = balance.limit === null ? null : Math.max(0, balance.limit - (balance.used + 1));

    await supabaseAdmin.from("usage_tracking").insert({
      organization_id: organizationId,
      user_id: userId ?? null,
      feature_key: featureKey,
      credits_consumed: 1,
      duration_ms: durationMs ?? null,
    });

    await supabaseAdmin.from("credit_transactions").insert({
      organization_id: organizationId,
      feature_key: featureKey,
      amount: -1,
      balance_after: balanceAfter,
    });

    console.log(`${LOG_PREFIX} Credits Consumed`, { organizationId, featureKey, remaining: balanceAfter });
  } catch (error) {
    console.error(`${LOG_PREFIX} Credit consumption logging failed`, error);
  }
}

export async function getCreditHistory(organizationId: string, limit = 50): Promise<CreditTransaction[]> {
  const { data, error } = await supabaseAdmin
    .from("credit_transactions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listUsage(organizationId: string, limit = 50): Promise<UsageTrackingEntry[]> {
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

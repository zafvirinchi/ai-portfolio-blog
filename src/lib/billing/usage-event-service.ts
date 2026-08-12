import { supabaseAdmin } from "../supabase/admin";

import { UsagePeriod, UsageMetric } from "./platform-schema";

const LOG_PREFIX = "[billing:usage]";
const TABLE = "platform_usage_events";

function periodStartIso(period: UsagePeriod): string | null {
  const now = new Date();

  switch (period) {
    case "DAY":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    case "MONTH":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    case "LIFETIME":
      return null;
  }
}

/**
 * Falls back to zero on ANY query failure (including the table not
 * existing yet, pre-migration) — a usage-lookup failure must never
 * block the feature it's metering, mirroring credit-service.ts's
 * usedThisMonth() precedent exactly.
 */
export async function getUsageCount(userId: string, metric: UsageMetric, period: UsagePeriod): Promise<number> {
  let query = supabaseAdmin.from(TABLE).select("id", { count: "exact", head: true }).eq("user_id", userId).eq("metric", metric);

  const since = periodStartIso(period);
  if (since) query = query.gte("occurred_at", since);

  const { count, error } = await query;

  if (error) {
    console.error(`${LOG_PREFIX} Usage lookup failed, treating as zero`, error);
    return 0;
  }

  return count ?? 0;
}

/**
 * ONLY ever called after the real billable operation has actually
 * succeeded (Step 8: "Do not count a request merely because an
 * endpoint was called... An unauthorized request must never consume
 * quota. A validation failure must not consume quota.") — every caller
 * in this milestone (entitlement-service.ts's recordUsage(), and the
 * two representative route integrations) calls this as the LAST step,
 * after the response is already known to be a success. Never throws —
 * a logging failure must never break the feature it's metering.
 */
export async function recordUsageEvent(userId: string, metric: UsageMetric): Promise<void> {
  const { error } = await supabaseAdmin.from(TABLE).insert({ user_id: userId, metric });

  if (error) {
    console.error(`${LOG_PREFIX} Usage recording failed`, error);
    return;
  }

  console.log(`${LOG_PREFIX} Usage Recorded`, { userId, metric });
}

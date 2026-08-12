import { supabaseAdmin } from "../supabase/admin";

import { DateRangePreset, dateRangeQuerySchema, resolveDateRange } from "./analytics-schema";
import { buildCacheKey, withCache } from "./analytics-cache";
import {
  AIUsageMetrics,
  AnomalyEvent,
  ConversionMetrics,
  DateRange,
  ChurnMetrics,
  FeatureMetrics,
  OrganizationMetrics,
  OverviewMetrics,
  RevenueMetrics,
  SubscriptionMetrics,
  TopOrganizationRow,
  TopUserRow,
  UserMetrics,
} from "./analytics-types";
import { getRevenueMetrics, getCurrentMrrArr } from "./revenue-analytics";
import { getSubscriptionMetrics, getChurnMetrics as computeChurnMetrics } from "./subscription-analytics";
import { getUserMetrics, getTopUsers as computeTopUsers } from "./user-analytics";
import { getOrganizationMetrics } from "./organization-analytics";
import { getAIUsageMetrics as computeAIUsageMetrics } from "./ai-usage-analytics";
import { getFeatureMetrics } from "./feature-analytics";
import { getConversionMetrics as computeConversionMetrics } from "./conversion-analytics";

const LOG_PREFIX = "[analytics]";
const CACHE_TTL_MS = 60_000;

export function parseRange(query: { range: DateRangePreset; from?: string; to?: string }): DateRange {
  return resolveDateRange(query);
}

/** The one place every /api/admin/analytics/* route turns its URL's ?range/from/to into a validated, resolved DateRange — malformed or abusive custom ranges (see MAX_RANGE_DAYS) throw a ZodError the route's own catch block turns into a 400. */
export function parseRangeFromSearchParams(searchParams: URLSearchParams): DateRange {
  const parsed = dateRangeQuerySchema.parse({
    range: searchParams.get("range") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  return resolveDateRange(parsed);
}

/** Shared by the CSV export route (and unit-tested directly) — never scattered inline in a route file. Quotes any field containing a comma/quote/newline, doubling embedded quotes per RFC 4180. */
export function toCsv(rows: Record<string, string | number | null>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const escape = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))];
  return lines.join("\n");
}

function cacheKeyFor(name: string, range: DateRange, extra: Record<string, unknown> = {}): string {
  return buildCacheKey(name, { from: range.from.toISOString(), to: range.to.toISOString(), ...extra });
}

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  console.log(`${LOG_PREFIX} Analytics query started`, { query: name });
  try {
    const result = await fn();
    console.log(`${LOG_PREFIX} Analytics query completed`, { query: name });
    return result;
  } catch (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { query: name, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function getRevenue(range: DateRange): Promise<RevenueMetrics> {
  return withCache(cacheKeyFor("revenue", range), () => timed("revenue", () => getRevenueMetrics(range)), CACHE_TTL_MS);
}

export async function getSubscriptions(range: DateRange): Promise<SubscriptionMetrics> {
  return withCache(cacheKeyFor("subscriptions", range), () => timed("subscriptions", () => getSubscriptionMetrics(range)), CACHE_TTL_MS);
}

export async function getChurn(range: DateRange): Promise<ChurnMetrics> {
  return withCache(cacheKeyFor("churn", range), () => timed("churn", () => computeChurnMetrics(range)), CACHE_TTL_MS);
}

export async function getUsers(range: DateRange): Promise<UserMetrics> {
  return withCache(cacheKeyFor("users", range), () => timed("users", () => getUserMetrics(range)), CACHE_TTL_MS);
}

export async function getOrganizations(range: DateRange): Promise<OrganizationMetrics> {
  return withCache(cacheKeyFor("organizations", range), () => timed("organizations", () => getOrganizationMetrics(range)), CACHE_TTL_MS);
}

export async function getAIUsage(range: DateRange): Promise<AIUsageMetrics> {
  return withCache(cacheKeyFor("ai-usage", range), () => timed("ai-usage", () => computeAIUsageMetrics(range)), CACHE_TTL_MS);
}

export async function getFeatures(range: DateRange): Promise<FeatureMetrics> {
  return withCache(cacheKeyFor("features", range), () => timed("features", () => getFeatureMetrics(range)), CACHE_TTL_MS);
}

export async function getConversion(range: DateRange): Promise<ConversionMetrics> {
  return withCache(cacheKeyFor("conversion", range), () => timed("conversion", () => computeConversionMetrics(range)), CACHE_TTL_MS);
}

export async function getTopUsers(range: DateRange, limit = 20): Promise<TopUserRow[]> {
  return withCache(cacheKeyFor("top-users", range, { limit }), () => timed("top-users", () => computeTopUsers(range, limit)), CACHE_TTL_MS);
}

export async function getTopOrganizations(range: DateRange, limit = 20): Promise<TopOrganizationRow[]> {
  const organizations = await getOrganizations(range);
  return organizations.topOrganizations.slice(0, limit);
}

export async function getTopFeatures(range: DateRange, limit = 20) {
  const features = await getFeatures(range);
  return features.features.slice(0, limit);
}

export async function getUsageTrends(range: DateRange): Promise<{
  aiUsage: { date: string; requests: number; credits: number }[];
  revenue: { date: string; grossCents: number; refundsCents: number }[];
  activeUsers: { date: string; activeUsers: number }[];
}> {
  const [aiUsage, revenue, users] = await Promise.all([getAIUsage(range), getRevenue(range), getUsers(range)]);
  return { aiUsage: aiUsage.dailyTrend, revenue: revenue.revenueTrend, activeUsers: users.activityTrend };
}

export async function getOverview(range: DateRange): Promise<OverviewMetrics> {
  return withCache(
    cacheKeyFor("overview", range),
    () =>
      timed("overview", async () => {
        const [users, subscriptions, churn, mrrArr, aiUsage] = await Promise.all([
          getUsers(range),
          getSubscriptions(range),
          getChurn(range),
          getCurrentMrrArr(),
          getAIUsage(range),
        ]);

        return {
          totalUsers: users.totalUsers,
          activeUsers: users.activeUsers.mau,
          newUsers: users.newUsers,
          paidUsers: users.paidUsers,
          activeSubscriptions: subscriptions.activeSubscriptions,
          mrrCents: mrrArr.mrrCents,
          arrCents: mrrArr.arrCents,
          churnRate: churn.customerChurnRate,
          aiCreditsUsed: aiUsage.totalCredits,
          estimatedAiCostCents: aiUsage.estimatedCostCents,
        };
      }),
    CACHE_TTL_MS
  );
}

// ---------------------------------------------------------------------------
// Anomaly detection — lightweight, rule-based (explicitly NOT another
// LLM agent, per spec). Always looks at fixed trailing windows (last
// 24h vs the 7 days before that), independent of the dashboard's
// selected date-range filter — an anomaly check answers "is something
// unusual happening right now," not "was something unusual within
// whatever range the admin picked."
// ---------------------------------------------------------------------------

interface DailyUsageRow {
  organization_id: string;
  user_id: string | null;
  actual_credits: number | null;
  credits_consumed: number;
  status: string;
  created_at: string;
}

async function fetchAnomalyWindowRows(): Promise<DailyUsageRow[]> {
  const since = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("organization_id, user_id, actual_credits, credits_consumed, status, created_at")
    .gte("created_at", since)
    .limit(20_000);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "usage_tracking (anomalies)", error: error.message });
    return [];
  }

  return data ?? [];
}

function creditsOf(row: DailyUsageRow): number {
  return row.actual_credits ?? row.credits_consumed ?? 0;
}

export async function getAnomalies(): Promise<AnomalyEvent[]> {
  return withCache("anomalies", () => timed("anomalies", computeAnomalies), CACHE_TTL_MS);
}

async function computeAnomalies(): Promise<AnomalyEvent[]> {
  const rows = await fetchAnomalyWindowRows();
  const now = new Date();
  const anomalies: AnomalyEvent[] = [];

  // Reuses organization-analytics.ts's existing near-limit detection
  // (current credit_balances state, independent of any date range) —
  // the `last_30_days` window passed here only affects that function's
  // unrelated topOrganizations-by-recent-usage field, which is ignored.
  const nearLimitRange = resolveDateRange({ range: "last_30_days" });
  const organizations = await getOrganizations(nearLimitRange);

  for (const warning of organizations.organizationsNearLimits) {
    anomalies.push({
      severity: warning.usagePercent >= 100 ? "critical" : "warning",
      type: "organization_near_limit",
      description: warning.description,
      timestamp: now.toISOString(),
      relatedEntity: { type: "organization", id: warning.organizationId, name: warning.organizationName },
    });
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const priorWeekStart = todayStart - 7 * 86_400_000;

  let todayCredits = 0;
  let priorWeekCredits = 0;
  const byUserToday = new Map<string, { requests: number; failed: number }>();
  const byOrgToday = new Map<string, number>();

  for (const row of rows) {
    const t = new Date(row.created_at).getTime();
    const credits = creditsOf(row);

    if (t >= todayStart) {
      todayCredits += credits;
      byOrgToday.set(row.organization_id, (byOrgToday.get(row.organization_id) ?? 0) + credits);

      if (row.user_id) {
        const entry = byUserToday.get(row.user_id) ?? { requests: 0, failed: 0 };
        entry.requests += 1;
        if (row.status !== "success") entry.failed += 1;
        byUserToday.set(row.user_id, entry);
      }
    } else if (t >= priorWeekStart) {
      priorWeekCredits += credits;
    }
  }

  const priorDailyAverage = priorWeekCredits / 7;

  if (priorDailyAverage > 0 && todayCredits > priorDailyAverage * 3) {
    anomalies.push({
      severity: "warning",
      type: "usage_spike",
      description: `Platform AI credit usage today (${todayCredits}) is more than 3x the trailing 7-day daily average (${Math.round(priorDailyAverage)}).`,
      timestamp: now.toISOString(),
      relatedEntity: { type: "platform", id: "platform", name: "Platform" },
    });

    anomalies.push({
      severity: "warning",
      type: "cost_increase",
      description: `Estimated AI cost today is on pace to exceed the recent daily average by more than 3x.`,
      timestamp: now.toISOString(),
      relatedEntity: { type: "platform", id: "platform", name: "Platform" },
    });
  }

  const averageRequestsPerActiveUser = byUserToday.size > 0 ? [...byUserToday.values()].reduce((sum, v) => sum + v.requests, 0) / byUserToday.size : 0;

  for (const [userId, activity] of byUserToday.entries()) {
    if (activity.failed >= 5) {
      anomalies.push({
        severity: activity.failed >= 10 ? "critical" : "warning",
        type: "repeated_failures",
        description: `User has ${activity.failed} failed AI requests today.`,
        timestamp: now.toISOString(),
        relatedEntity: { type: "user", id: userId, name: userId },
      });
    }

    if (averageRequestsPerActiveUser > 0 && activity.requests > averageRequestsPerActiveUser * 5 && activity.requests >= 20) {
      anomalies.push({
        severity: "info",
        type: "user_high_requests",
        description: `User made ${activity.requests} AI requests today — more than 5x the platform's per-active-user average (${Math.round(averageRequestsPerActiveUser)}).`,
        timestamp: now.toISOString(),
        relatedEntity: { type: "user", id: userId, name: userId },
      });
    }
  }

  const averageOrgCreditsToday = byOrgToday.size > 0 ? [...byOrgToday.values()].reduce((sum, v) => sum + v, 0) / byOrgToday.size : 0;

  for (const [organizationId, credits] of byOrgToday.entries()) {
    if (averageOrgCreditsToday > 0 && credits > averageOrgCreditsToday * 5 && credits >= 50) {
      anomalies.push({
        severity: "warning",
        type: "high_credit_consumption",
        description: `Organization consumed ${credits} AI credits today — more than 5x the platform's per-organization average (${Math.round(averageOrgCreditsToday)}).`,
        timestamp: now.toISOString(),
        relatedEntity: { type: "organization", id: organizationId, name: organizationId },
      });
    }
  }

  return anomalies;
}

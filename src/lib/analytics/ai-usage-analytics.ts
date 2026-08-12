import { supabaseAdmin } from "../supabase/admin";
import { CREDITS_PER_DOLLAR } from "../ai/usage/usage-policy";

import { DateRange } from "./analytics-types";
import { AIUsageByFeatureRow, AIUsageByModelRow, AIUsageMetrics } from "./analytics-types";

const LOG_PREFIX = "[analytics]";

// A hard row cap on any single usage_tracking scan — this project
// aggregates in application code (same pattern as usage-service.ts's
// getSummary()), not via a SQL GROUP BY, so an unbounded fetch on a
// large table is the actual "abusive database query" the date-range
// validation is meant to prevent. See PHASE14_MILESTONE5 docs, Known
// Limitations, for the real fix (a Postgres aggregation RPC) once
// usage_tracking outgrows this.
const MAX_ROWS = 20_000;

interface UsageRow {
  organization_id: string;
  user_id: string | null;
  feature_key: string;
  operation: string | null;
  model: string | null;
  actual_credits: number | null;
  credits_consumed: number;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  status: string;
  created_at: string;
}

function creditsToCents(credits: number): number {
  return Math.round((credits / CREDITS_PER_DOLLAR) * 100);
}

async function fetchUsageRows(range: DateRange): Promise<UsageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("organization_id, user_id, feature_key, operation, model, actual_credits, credits_consumed, input_tokens, output_tokens, duration_ms, status, created_at")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "usage_tracking", error: error.message });
    return [];
  }

  return data ?? [];
}

function creditsOf(row: UsageRow): number {
  return row.actual_credits ?? row.credits_consumed ?? 0;
}

export async function getAIUsageMetrics(range: DateRange): Promise<AIUsageMetrics> {
  const rows = await fetchUsageRows(range);

  let totalCredits = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let successfulRequests = 0;
  let failedRequests = 0;
  let durationSum = 0;
  let durationCount = 0;

  const byFeature = new Map<string, { requests: number; credits: number; tokens: number }>();
  const byModel = new Map<string, { requests: number; inputTokens: number; outputTokens: number; durationSum: number; durationCount: number; failed: number }>();
  const byDay = new Map<string, { requests: number; credits: number }>();

  for (const row of rows) {
    const credits = creditsOf(row);
    totalCredits += credits;
    inputTokens += row.input_tokens ?? 0;
    outputTokens += row.output_tokens ?? 0;

    if (row.status === "success") successfulRequests++;
    else failedRequests++;

    if (row.duration_ms != null) {
      durationSum += row.duration_ms;
      durationCount++;
    }

    const feature = byFeature.get(row.feature_key) ?? { requests: 0, credits: 0, tokens: 0 };
    feature.requests += 1;
    feature.credits += credits;
    feature.tokens += (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
    byFeature.set(row.feature_key, feature);

    if (row.model) {
      const model = byModel.get(row.model) ?? { requests: 0, inputTokens: 0, outputTokens: 0, durationSum: 0, durationCount: 0, failed: 0 };
      model.requests += 1;
      model.inputTokens += row.input_tokens ?? 0;
      model.outputTokens += row.output_tokens ?? 0;
      if (row.duration_ms != null) {
        model.durationSum += row.duration_ms;
        model.durationCount += 1;
      }
      if (row.status !== "success") model.failed += 1;
      byModel.set(row.model, model);
    }

    const day = row.created_at.slice(0, 10);
    const dayEntry = byDay.get(day) ?? { requests: 0, credits: 0 };
    dayEntry.requests += 1;
    dayEntry.credits += credits;
    byDay.set(day, dayEntry);
  }

  const featureRows: AIUsageByFeatureRow[] = [...byFeature.entries()].map(([feature, v]) => ({
    feature,
    requests: v.requests,
    credits: v.credits,
    tokens: v.tokens,
    estimatedCostCents: creditsToCents(v.credits),
  }));

  // Model-level credit sums are grouped separately from featureRows
  // (which are grouped by feature, not model) — computed here from the
  // same already-fetched rows rather than a second DB pass.
  const modelCredits = new Map<string, number>();
  for (const row of rows) {
    if (!row.model) continue;
    modelCredits.set(row.model, (modelCredits.get(row.model) ?? 0) + creditsOf(row));
  }

  const modelRows: AIUsageByModelRow[] = [...byModel.entries()].map(([model, v]) => ({
    model,
    requests: v.requests,
    inputTokens: v.inputTokens,
    outputTokens: v.outputTokens,
    totalTokens: v.inputTokens + v.outputTokens,
    estimatedCostCents: creditsToCents(modelCredits.get(model) ?? 0),
    averageDurationMs: v.durationCount > 0 ? Math.round(v.durationSum / v.durationCount) : null,
    failureRate: v.requests > 0 ? v.failed / v.requests : 0,
  }));

  return {
    totalRequests: rows.length,
    totalCredits,
    totalTokens: inputTokens + outputTokens,
    inputTokens,
    outputTokens,
    estimatedCostCents: creditsToCents(totalCredits),
    successfulRequests,
    failedRequests,
    averageDurationMs: durationCount > 0 ? Math.round(durationSum / durationCount) : null,
    byFeature: featureRows.sort((a, b) => b.credits - a.credits),
    byModel: modelRows.sort((a, b) => b.estimatedCostCents - a.estimatedCostCents),
    dailyTrend: [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Reused by feature-analytics.ts and conversion-analytics.ts — which organizations/users touched each feature in this range, without a second full table scan per caller. */
export async function getFeatureUsageIndex(range: DateRange): Promise<{
  byFeature: Map<string, { organizations: Set<string>; users: Set<string>; requests: number; credits: number; lastUsed: string | null }>;
}> {
  const rows = await fetchUsageRows(range);
  const byFeature = new Map<string, { organizations: Set<string>; users: Set<string>; requests: number; credits: number; lastUsed: string | null }>();

  for (const row of rows) {
    const entry = byFeature.get(row.feature_key) ?? { organizations: new Set<string>(), users: new Set<string>(), requests: 0, credits: 0, lastUsed: null };
    entry.organizations.add(row.organization_id);
    if (row.user_id) entry.users.add(row.user_id);
    entry.requests += 1;
    entry.credits += creditsOf(row);
    if (!entry.lastUsed || row.created_at > entry.lastUsed) entry.lastUsed = row.created_at;
    byFeature.set(row.feature_key, entry);
  }

  return { byFeature };
}

export interface TopUserUsage {
  userId: string;
  organizationId: string | null;
  aiRequests: number;
  creditsUsed: number;
  lastActivity: string | null;
  featuresUsed: Set<string>;
}

/** Reused by user-analytics.ts's getTopUsers(). */
export async function getUsageByUser(range: DateRange): Promise<Map<string, TopUserUsage>> {
  const rows = await fetchUsageRows(range);
  const byUser = new Map<string, TopUserUsage>();

  for (const row of rows) {
    if (!row.user_id) continue;

    const entry = byUser.get(row.user_id) ?? {
      userId: row.user_id,
      organizationId: row.organization_id,
      aiRequests: 0,
      creditsUsed: 0,
      lastActivity: null,
      featuresUsed: new Set<string>(),
    };

    entry.aiRequests += 1;
    entry.creditsUsed += creditsOf(row);
    entry.featuresUsed.add(row.feature_key);
    if (!entry.lastActivity || row.created_at > entry.lastActivity) entry.lastActivity = row.created_at;

    byUser.set(row.user_id, entry);
  }

  return byUser;
}

export interface OrganizationFeatureUsageRow {
  feature: string;
  requests: number;
  credits: number;
  activeUsers: number;
  lastUsed: string | null;
}

/** Backs the self-serve GET /api/organization/analytics — a query already scoped to one organizationId at the database level (not a platform-wide fetch filtered client-side), so it can never return another organization's rows. */
export async function getFeatureUsageForOrganization(organizationId: string, range: DateRange): Promise<OrganizationFeatureUsageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("feature_key, user_id, actual_credits, credits_consumed, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .limit(MAX_ROWS);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "usage_tracking (organization feature usage)", error: error.message });
    return [];
  }

  const byFeature = new Map<string, { requests: number; credits: number; users: Set<string>; lastUsed: string | null }>();
  for (const row of data ?? []) {
    const entry = byFeature.get(row.feature_key) ?? { requests: 0, credits: 0, users: new Set<string>(), lastUsed: null };
    entry.requests += 1;
    entry.credits += row.actual_credits ?? row.credits_consumed ?? 0;
    if (row.user_id) entry.users.add(row.user_id);
    if (!entry.lastUsed || row.created_at > entry.lastUsed) entry.lastUsed = row.created_at;
    byFeature.set(row.feature_key, entry);
  }

  return [...byFeature.entries()]
    .map(([feature, v]) => ({ feature, requests: v.requests, credits: v.credits, activeUsers: v.users.size, lastUsed: v.lastUsed }))
    .sort((a, b) => b.credits - a.credits);
}

/**
 * Same shape as getFeatureUsageForOrganization but scoped to one
 * (userId, organizationId) pair — personal usage is defined as this
 * user's requests within their currently active organization (not a
 * cross-organization merge), matching how the credit pool it draws
 * from is itself organization-scoped. See PHASE14_MILESTONE6 docs,
 * Analytics Definitions.
 */
export async function getFeatureUsageForUser(userId: string, organizationId: string, range: DateRange): Promise<{ feature: string; requests: number; credits: number; lastUsed: string | null }[]> {
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("feature_key, actual_credits, credits_consumed, created_at")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .limit(MAX_ROWS);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "usage_tracking (user feature usage)", error: error.message });
    return [];
  }

  const byFeature = new Map<string, { requests: number; credits: number; lastUsed: string | null }>();
  for (const row of data ?? []) {
    const entry = byFeature.get(row.feature_key) ?? { requests: 0, credits: 0, lastUsed: null };
    entry.requests += 1;
    entry.credits += row.actual_credits ?? row.credits_consumed ?? 0;
    if (!entry.lastUsed || row.created_at > entry.lastUsed) entry.lastUsed = row.created_at;
    byFeature.set(row.feature_key, entry);
  }

  return [...byFeature.entries()].map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.credits - a.credits);
}

/** Daily requests/credits for one user within their active organization — powers the personal Usage Trend chart. */
export async function getDailyTrendForUser(userId: string, organizationId: string, range: DateRange): Promise<{ date: string; requests: number; credits: number }[]> {
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("actual_credits, credits_consumed, created_at")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .limit(MAX_ROWS);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "usage_tracking (user daily trend)", error: error.message });
    return [];
  }

  const byDay = new Map<string, { requests: number; credits: number }>();
  for (const row of data ?? []) {
    const day = row.created_at.slice(0, 10);
    const entry = byDay.get(day) ?? { requests: 0, credits: 0 };
    entry.requests += 1;
    entry.credits += row.actual_credits ?? row.credits_consumed ?? 0;
    byDay.set(day, entry);
  }

  return [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
}

export interface RecentActivityRow {
  feature: string;
  createdAt: string;
  status: string;
  credits: number;
}

/**
 * Raw (non-aggregated) recent rows for one user's own activity feed —
 * only the columns safe to show a customer (feature, timestamp, status,
 * credits). usage_tracking never stores prompt/response/resume content
 * in the first place (Milestone 4's own privacy rule), so there is no
 * sensitive column to accidentally select here.
 */
export async function getRecentActivityForUser(userId: string, organizationId: string, limit = 20): Promise<RecentActivityRow[]> {
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("feature_key, created_at, status, actual_credits, credits_consumed")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "usage_tracking (user recent activity)", error: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    feature: row.feature_key,
    createdAt: row.created_at,
    status: row.status,
    credits: row.actual_credits ?? row.credits_consumed ?? 0,
  }));
}

/** Daily requests/credits for one organization — the organization-scoped counterpart to getAIUsageMetrics()'s platform-wide dailyTrend, used by the admin-only Organization Usage Trend, never mixed with another organization's rows. */
export async function getDailyTrendForOrganization(organizationId: string, range: DateRange): Promise<{ date: string; requests: number; credits: number }[]> {
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("actual_credits, credits_consumed, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .limit(MAX_ROWS);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "usage_tracking (organization daily trend)", error: error.message });
    return [];
  }

  const byDay = new Map<string, { requests: number; credits: number }>();
  for (const row of data ?? []) {
    const day = row.created_at.slice(0, 10);
    const entry = byDay.get(day) ?? { requests: 0, credits: 0 };
    entry.requests += 1;
    entry.credits += row.actual_credits ?? row.credits_consumed ?? 0;
    byDay.set(day, entry);
  }

  return [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
}

export interface OrganizationTopUserRow {
  userId: string;
  aiRequests: number;
  creditsUsed: number;
  lastActivity: string | null;
  featuresUsed: string[];
}

/**
 * Top users WITHIN one organization — a query already scoped to that
 * organizationId at the database level (unlike user-analytics.ts's
 * platform-wide getUsageByUser(), which an admin-only caller then
 * doesn't filter down further). This is the function that guarantees
 * "organization admin cannot see another organization's users."
 */
export async function getTopUsersForOrganization(organizationId: string, range: DateRange, limit = 20): Promise<OrganizationTopUserRow[]> {
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("user_id, feature_key, actual_credits, credits_consumed, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .not("user_id", "is", null)
    .limit(MAX_ROWS);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "usage_tracking (organization top users)", error: error.message });
    return [];
  }

  const byUser = new Map<string, { aiRequests: number; creditsUsed: number; lastActivity: string | null; featuresUsed: Set<string> }>();

  for (const row of data ?? []) {
    if (!row.user_id) continue;
    const entry = byUser.get(row.user_id) ?? { aiRequests: 0, creditsUsed: 0, lastActivity: null, featuresUsed: new Set<string>() };
    entry.aiRequests += 1;
    entry.creditsUsed += row.actual_credits ?? row.credits_consumed ?? 0;
    entry.featuresUsed.add(row.feature_key);
    if (!entry.lastActivity || row.created_at > entry.lastActivity) entry.lastActivity = row.created_at;
    byUser.set(row.user_id, entry);
  }

  return [...byUser.entries()]
    .map(([userId, v]) => ({ userId, aiRequests: v.aiRequests, creditsUsed: v.creditsUsed, lastActivity: v.lastActivity, featuresUsed: [...v.featuresUsed] }))
    .sort((a, b) => b.creditsUsed - a.creditsUsed)
    .slice(0, limit);
}

/** Single-organization-scoped counterpart to getUsageByOrganization() below — used by the self-serve organization endpoint so a customer's request never scans the whole platform's usage_tracking table just to read their own one row out of it. */
export async function getUsageForOrganization(organizationId: string, range: DateRange): Promise<{ credits: number; requests: number; activeUsers: Set<string>; lastActivity: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("usage_tracking")
    .select("user_id, actual_credits, credits_consumed, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .limit(MAX_ROWS);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "usage_tracking (single organization usage)", error: error.message });
    return { credits: 0, requests: 0, activeUsers: new Set(), lastActivity: null };
  }

  const result = { credits: 0, requests: 0, activeUsers: new Set<string>(), lastActivity: null as string | null };
  for (const row of data ?? []) {
    result.credits += row.actual_credits ?? row.credits_consumed ?? 0;
    result.requests += 1;
    if (row.user_id) result.activeUsers.add(row.user_id);
    if (!result.lastActivity || row.created_at > result.lastActivity) result.lastActivity = row.created_at;
  }

  return result;
}

/** Reused only by the ADMIN, platform-wide organization-analytics.ts's getOrganizationMetrics() — deliberately fetches every organization's rows in one pass since the admin view needs all of them anyway. Never used by the customer-facing self-serve path (see getUsageForOrganization() above). */
export async function getUsageByOrganization(range: DateRange): Promise<Map<string, { credits: number; requests: number; activeUsers: Set<string>; lastActivity: string | null }>> {
  const rows = await fetchUsageRows(range);
  const byOrg = new Map<string, { credits: number; requests: number; activeUsers: Set<string>; lastActivity: string | null }>();

  for (const row of rows) {
    const entry = byOrg.get(row.organization_id) ?? { credits: 0, requests: 0, activeUsers: new Set<string>(), lastActivity: null };
    entry.credits += creditsOf(row);
    entry.requests += 1;
    if (row.user_id) entry.activeUsers.add(row.user_id);
    if (!entry.lastActivity || row.created_at > entry.lastActivity) entry.lastActivity = row.created_at;
    byOrg.set(row.organization_id, entry);
  }

  return byOrg;
}

export { creditsToCents };

import { supabaseAdmin } from "../supabase/admin";
import { organizationService } from "../saas/organization-service";

import { DateRange, SubscriptionCounts, TopUserRow, UserMetrics } from "./analytics-types";
import { getOrganizationPlanMap, highestPlan } from "./subscription-analytics";
import { getUsageByUser } from "./ai-usage-analytics";

const LOG_PREFIX = "[analytics]";

// Supabase's admin listUsers() is paginated (no single "give me
// everything" call) — capped at 20 pages × 1000/page = 20,000 users,
// ample for this project's actual scale and the same "abusive query"
// guard as usage_tracking's MAX_ROWS. See Known Limitations in the
// milestone doc for the real fix (a users summary table/RPC) if this
// project ever outgrows that.
const MAX_USER_PAGES = 20;
const USERS_PER_PAGE = 1000;

export interface AuthUserRow {
  id: string;
  email: string | null;
  created_at: string;
}

export async function listAllAuthUsers(): Promise<AuthUserRow[]> {
  const users: AuthUserRow[] = [];

  for (let page = 1; page <= MAX_USER_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });

    if (error) {
      console.error(`${LOG_PREFIX} Analytics query failed`, { source: "auth.users", error: error.message });
      break;
    }

    for (const user of data.users) {
      users.push({ id: user.id, email: user.email ?? null, created_at: user.created_at });
    }

    if (data.users.length < USERS_PER_PAGE) break;
  }

  return users;
}

/**
 * DAU/WAU/MAU definition, documented per spec: a "meaningful AI
 * activity event" is one row in usage_tracking (an actual metered AI
 * feature invocation — resume analysis, JD match, AI chat, etc.), NOT
 * a page load or login. Always the trailing N days from now,
 * independent of the dashboard's selected date-range filter — this
 * matches the standard SaaS convention that DAU/WAU/MAU are fixed
 * rolling windows, not range-scoped metrics.
 */
async function getActiveUserCounts(): Promise<{ dau: number; wau: number; mau: number }> {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const { data, error } = await supabaseAdmin.from("usage_tracking").select("user_id, created_at").gte("created_at", since30).not("user_id", "is", null).limit(20_000);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "usage_tracking (active users)", error: error.message });
    return { dau: 0, wau: 0, mau: 0 };
  }

  const since1 = now.getTime() - 1 * 86_400_000;
  const since7 = now.getTime() - 7 * 86_400_000;

  const dauSet = new Set<string>();
  const wauSet = new Set<string>();
  const mauSet = new Set<string>();

  for (const row of data ?? []) {
    if (!row.user_id) continue;
    const t = new Date(row.created_at).getTime();
    mauSet.add(row.user_id);
    if (t >= since7) wauSet.add(row.user_id);
    if (t >= since1) dauSet.add(row.user_id);
  }

  return { dau: dauSet.size, wau: wauSet.size, mau: mauSet.size };
}

async function getUsersByPlan(): Promise<SubscriptionCounts> {
  const [{ data: members, error }, planByOrg] = await Promise.all([
    supabaseAdmin.from("organization_members").select("user_id, organization_id").limit(20_000),
    getOrganizationPlanMap(),
  ]);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "organization_members", error: error.message });
    return { free: 0, professional: 0, premium: 0, enterprise: 0 };
  }

  const orgsByUser = new Map<string, string[]>();
  for (const row of members ?? []) {
    const list = orgsByUser.get(row.user_id) ?? [];
    list.push(row.organization_id);
    orgsByUser.set(row.user_id, list);
  }

  const counts: SubscriptionCounts = { free: 0, professional: 0, premium: 0, enterprise: 0 };
  for (const orgIds of orgsByUser.values()) {
    const planKeys = orgIds.map((orgId) => planByOrg.get(orgId) ?? "free");
    counts[highestPlan(planKeys)] += 1;
  }

  return counts;
}

export async function getUserMetrics(range: DateRange): Promise<UserMetrics> {
  const [users, activeUsers, usersByPlan, usageByUser] = await Promise.all([listAllAuthUsers(), getActiveUserCounts(), getUsersByPlan(), getUsageByUser(range)]);

  const newUsers = users.filter((user) => {
    const t = new Date(user.created_at).getTime();
    return t >= range.from.getTime() && t <= range.to.getTime();
  }).length;

  const paidUsers = usersByPlan.professional + usersByPlan.premium + usersByPlan.enterprise;

  const byDay = new Map<string, Set<string>>();
  const priorUsers = new Set<string>();

  // A second, lighter usage_tracking pass restricted to just before the
  // range — used only to classify "returning" (used the product before
  // this range AND is active within it), not for any credit/cost math.
  const { data: priorRows } = await supabaseAdmin
    .from("usage_tracking")
    .select("user_id")
    .lt("created_at", range.from.toISOString())
    .not("user_id", "is", null)
    .limit(20_000);

  for (const row of priorRows ?? []) {
    if (row.user_id) priorUsers.add(row.user_id);
  }

  let returningUsers = 0;
  for (const userId of usageByUser.keys()) {
    if (priorUsers.has(userId)) returningUsers += 1;
  }

  // activityTrend needs per-day distinct users within the selected
  // range — usageByUser only has range-wide totals, so this reads
  // usage_tracking's created_at once more, grouped by day this time.
  const { data: rangeRows } = await supabaseAdmin
    .from("usage_tracking")
    .select("user_id, created_at")
    .gte("created_at", range.from.toISOString())
    .lte("created_at", range.to.toISOString())
    .not("user_id", "is", null)
    .limit(20_000);

  for (const row of rangeRows ?? []) {
    if (!row.user_id) continue;
    const day = row.created_at.slice(0, 10);
    const set = byDay.get(day) ?? new Set<string>();
    set.add(row.user_id);
    byDay.set(day, set);
  }

  return {
    totalUsers: users.length,
    newUsers,
    activeUsers,
    returningUsers,
    paidUsers,
    freeUsers: Math.max(0, users.length - paidUsers),
    usersByPlan,
    activityTrend: [...byDay.entries()].map(([date, set]) => ({ date, activeUsers: set.size })).sort((a, b) => a.date.localeCompare(b.date)),
    activityDefinition: {
      dau: "Distinct users with ≥1 metered AI feature call (usage_tracking row) in the trailing 24 hours.",
      wau: "Distinct users with ≥1 metered AI feature call in the trailing 7 days.",
      mau: "Distinct users with ≥1 metered AI feature call in the trailing 30 days.",
    },
  };
}

export async function getTopUsers(range: DateRange, limit = 20): Promise<TopUserRow[]> {
  const [usageByUser, organizations, planByOrg] = await Promise.all([getUsageByUser(range), organizationService.listAll(), getOrganizationPlanMap()]);

  const orgNameById = new Map(organizations.map((org) => [org.id, org.name]));

  const rows = [...usageByUser.values()]
    .sort((a, b) => b.creditsUsed - a.creditsUsed)
    .slice(0, limit)
    .map((entry) => ({
      userId: entry.userId,
      organizationId: entry.organizationId,
      aiRequests: entry.aiRequests,
      creditsUsed: entry.creditsUsed,
      lastActivity: entry.lastActivity,
      featuresUsed: [...entry.featuresUsed],
    }));

  // Emails are resolved one at a time via the Admin API (no bulk
  // "getUsersByIds" exists) — bounded by `limit` (default 20), not the
  // full user base, so this stays cheap.
  const withEmails = await Promise.all(
    rows.map(async (row) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(row.userId);
      return {
        userId: row.userId,
        email: data.user?.email ?? null,
        organizationId: row.organizationId,
        organizationName: row.organizationId ? (orgNameById.get(row.organizationId) ?? null) : null,
        planKey: row.organizationId ? (planByOrg.get(row.organizationId) ?? "free") : null,
        aiRequests: row.aiRequests,
        creditsUsed: row.creditsUsed,
        lastActivity: row.lastActivity,
        featuresUsed: row.featuresUsed,
      };
    })
  );

  return withEmails;
}

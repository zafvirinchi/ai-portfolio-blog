import { z } from "zod";

import { supabaseAdmin } from "../supabase/admin";
import { createSupabaseServerClient } from "../supabase-server";
import { getTenantContext } from "../saas/tenant-context";
import { getActiveSubscription } from "../billing/subscription-service";
import { getBalance as getAiCreditBalance } from "../ai/usage/usage-service";
import { PlanKey } from "../billing/billing-schema";
import { ResolvedSubscription } from "../billing/billing-types";

import { DateRange } from "./analytics-types";
import { CUSTOMER_RANGE_PRESETS, CustomerDateRange, getUsageLimitWarning, resolveCustomerDateRange, UsageLimitWarning } from "./customer-usage-shared";
import {
  getDailyTrendForOrganization,
  getDailyTrendForUser,
  getFeatureUsageForOrganization,
  getFeatureUsageForUser,
  getRecentActivityForUser,
  getTopUsersForOrganization,
  OrganizationFeatureUsageRow,
  RecentActivityRow,
} from "./ai-usage-analytics";
import { getOrganizationSelfMetrics } from "./organization-analytics";

const LOG_PREFIX = "[customer-analytics]";

// Re-exported so every existing server-side caller
// (routes/tests importing from customer-analytics-service.ts) keeps
// working unchanged — the split only matters for client components,
// which must import customer-usage-shared.ts directly instead.
export { CUSTOMER_RANGE_PRESETS, resolveCustomerDateRange, getUsageLimitWarning };
export type { CustomerRangePreset, CustomerDateRange, UsageLimitWarning } from "./customer-usage-shared";

/**
 * The customer-safe analytics layer — Milestone 5's AnalyticsService is
 * platform/admin-scoped by design (every query there spans every
 * organization); this file is the "extend it" the spec asks for,
 * reusing every underlying query helper (ai-usage-analytics.ts,
 * organization-analytics.ts) but exposing only the subset appropriate
 * for an individual user or a single organization's own admin. Every
 * function here takes an ALREADY-RESOLVED userId/organizationId — none
 * of them accept a client-supplied identity; the API routes in
 * src/app/api/usage/ and src/app/api/organization/usage/ are the only
 * callers, and they resolve identity exclusively from
 * getTenantContext()/the authenticated Supabase session.
 */

// ---------------------------------------------------------------------------
// Identity resolution — the ONLY place these API routes derive who's
// asking. Never accepts a userId/organizationId parameter; both come
// from the authenticated Supabase session (resolveCustomerIdentity)
// and, for organization-admin endpoints, the session's own role/
// permissions (requireOrganizationAdmin). A forged body/query
// userId/organizationId/role is simply never read.
// ---------------------------------------------------------------------------

export interface CustomerIdentity {
  userId: string;
  email: string | null;
  /** null when the authenticated user has no active organization membership — every "me" endpoint must treat this as the "You don't belong to an organization" empty state, never as an error. */
  organizationId: string | null;
}

export async function resolveCustomerIdentity(): Promise<CustomerIdentity | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const tenantContext = await getTenantContext();
  return { userId: user.id, email: user.email ?? null, organizationId: tenantContext?.organizationId ?? null };
}

export class OrganizationAdminRequiredError extends Error {
  constructor() {
    super("This section is restricted to organization administrators.");
    this.name = "OrganizationAdminRequiredError";
  }
}

/**
 * The gate for every organization-admin-only endpoint (top users, CSV
 * export of organization usage) — role/permissions come from
 * getTenantContext(), which itself derives the caller's role from the
 * organization_members row matched to their authenticated session, not
 * from any client input. "Manage Billing" is the existing permission
 * DEFAULT_ROLE_PERMISSIONS already grants only to Owner/Admin.
 */
export async function requireOrganizationAdmin(): Promise<{ userId: string; organizationId: string }> {
  const context = await getTenantContext();

  if (!context) {
    throw new Error("Not authenticated, or no active organization membership.");
  }

  if (!context.permissions.includes("Manage Billing")) {
    throw new OrganizationAdminRequiredError();
  }

  return { userId: context.userId, organizationId: context.organizationId };
}

const customerRangeQuerySchema = z.object({ range: z.enum(CUSTOMER_RANGE_PRESETS).default("30d") });

/** The one place every /api/usage/* and /api/organization/usage/* route turns its URL's ?range into a validated CustomerRangePreset — an unrecognized value throws a ZodError the route's own catch block turns into a 400. There is no "custom" option here: normal customers only ever get these 4 fixed choices. */
export function parseCustomerRangeFromSearchParams(searchParams: URLSearchParams, subscription: ResolvedSubscription): CustomerDateRange {
  const parsed = customerRangeQuerySchema.parse({ range: searchParams.get("range") ?? undefined });
  return resolveCustomerDateRange(parsed.range, subscription);
}

// ---------------------------------------------------------------------------
// Individual user ("me") — every query below is scoped to (userId,
// organizationId): the user's own requests within their CURRENTLY
// ACTIVE organization, not merged across every organization they
// belong to. See PHASE14_MILESTONE6 docs, Analytics Definitions.
// ---------------------------------------------------------------------------

export interface MySubscriptionSummary {
  planName: string;
  planKey: PlanKey;
  status: string;
  billingInterval: string;
  isFreePlan: boolean;
  renewalDate: string | null;
  monthlyCredits: number | null;
  creditsUsed: number;
  creditsRemaining: number | null;
  creditsUsagePercent: number | null;
  creditsResetDate: string;
  limitWarning: UsageLimitWarning | null;
}

/** The organization's shared AI credit pool, presented to this member — credits in this system are pooled per-organization (Milestone 4's design), never per-user, so this is honestly "your organization's credits," not "your personal credits." The UI labels it that way. */
export async function getMySubscription(organizationId: string): Promise<MySubscriptionSummary> {
  const [subscription, balance] = await Promise.all([getActiveSubscription(organizationId), getAiCreditBalance(organizationId)]);

  return {
    planName: subscription.plan.name,
    planKey: subscription.plan.key,
    status: subscription.status,
    billingInterval: subscription.billing_interval,
    isFreePlan: subscription.isImplicitFree,
    renewalDate: subscription.isImplicitFree ? null : subscription.current_period_end,
    monthlyCredits: balance.monthlyLimit,
    creditsUsed: balance.reserved + balance.consumed,
    creditsRemaining: balance.remaining,
    creditsUsagePercent: balance.usagePercent,
    creditsResetDate: balance.resetDate,
    limitWarning: getUsageLimitWarning(balance.usagePercent),
  };
}

/** The authoritative credit balance — never computed client-side. A thin, unmodified pass-through of Milestone 4's own getBalance(); this function exists only so callers in this package don't need to import across two packages for the same concept. */
export async function getMyCredits(organizationId: string) {
  return getAiCreditBalance(organizationId);
}

export interface MyUsageSummary {
  totalRequests: number;
  totalCredits: number;
  topFeature: string | null;
}

export async function getMyUsage(userId: string, organizationId: string, range: DateRange): Promise<MyUsageSummary> {
  const featureUsage = await getFeatureUsageForUser(userId, organizationId, range);
  return {
    totalRequests: featureUsage.reduce((sum, row) => sum + row.requests, 0),
    totalCredits: featureUsage.reduce((sum, row) => sum + row.credits, 0),
    topFeature: featureUsage[0]?.feature ?? null, // getFeatureUsageForUser already sorts by credits desc
  };
}

export interface MyFeatureUsageRow {
  feature: string;
  requests: number;
  credits: number;
  lastUsed: string | null;
  percentOfUsage: number;
}

export async function getMyFeatureUsage(userId: string, organizationId: string, range: DateRange): Promise<MyFeatureUsageRow[]> {
  const rows = await getFeatureUsageForUser(userId, organizationId, range);
  const totalCredits = rows.reduce((sum, row) => sum + row.credits, 0);

  return rows.map((row) => ({ ...row, percentOfUsage: totalCredits > 0 ? Math.round((row.credits / totalCredits) * 100) : 0 }));
}

export async function getMyUsageTrend(userId: string, organizationId: string, range: DateRange) {
  return getDailyTrendForUser(userId, organizationId, range);
}

export async function getMyRecentActivity(userId: string, organizationId: string, limit = 20): Promise<RecentActivityRow[]> {
  return getRecentActivityForUser(userId, organizationId, limit);
}

// ---------------------------------------------------------------------------
// Organization (admin) — every query is scoped to one organizationId at
// the database level (never a platform-wide fetch filtered client-
// side). estimatedAiCostCents is deliberately dropped from every
// response shape below — internal provider cost is never surfaced to a
// customer, admin or not, per this milestone's own rule.
// ---------------------------------------------------------------------------

export interface OrganizationUsageSummary {
  organizationId: string;
  planKey: string;
  seats: number;
  seatLimit: number | null;
  availableSeats: number | null;
  activeUsers: number;
  aiCreditsUsed: number;
  creditsMonthlyLimit: number | null;
  creditsRemaining: number | null;
  creditsUsagePercent: number | null;
  creditsResetDate: string;
  lastActivity: string | null;
  limitWarning: UsageLimitWarning | null;
  trend: { date: string; requests: number; credits: number }[];
}

export async function getOrganizationUsage(organizationId: string, range: DateRange): Promise<OrganizationUsageSummary> {
  const [metrics, trend] = await Promise.all([getOrganizationSelfMetrics(organizationId, range), getDailyTrendForOrganization(organizationId, range)]);

  return {
    organizationId: metrics.organizationId,
    planKey: metrics.planKey,
    seats: metrics.seats,
    seatLimit: metrics.seatLimit,
    availableSeats: metrics.availableSeats,
    activeUsers: metrics.activeUsers,
    aiCreditsUsed: metrics.aiCreditsUsed,
    creditsMonthlyLimit: metrics.creditsMonthlyLimit,
    creditsRemaining: metrics.creditsRemaining,
    creditsUsagePercent: metrics.creditsUsagePercent,
    creditsResetDate: metrics.creditsResetDate,
    lastActivity: metrics.lastActivity,
    limitWarning: getUsageLimitWarning(metrics.creditsUsagePercent),
    trend,
  };
}

export interface OrganizationSeatSummary {
  totalSeats: number | null;
  assignedSeats: number;
  availableSeats: number | null;
  utilizationPercent: number | null;
}

export async function getOrganizationSeats(organizationId: string, range: DateRange): Promise<OrganizationSeatSummary> {
  const metrics = await getOrganizationSelfMetrics(organizationId, range);

  return {
    totalSeats: metrics.seatLimit,
    assignedSeats: metrics.seats,
    availableSeats: metrics.availableSeats,
    utilizationPercent: metrics.seatLimit && metrics.seatLimit > 0 ? Math.round((metrics.seats / metrics.seatLimit) * 100) : null,
  };
}

export async function getOrganizationFeatureUsage(organizationId: string, range: DateRange): Promise<OrganizationFeatureUsageRow[]> {
  return getFeatureUsageForOrganization(organizationId, range);
}

export async function getOrganizationUsageTrend(organizationId: string, range: DateRange) {
  return getDailyTrendForOrganization(organizationId, range);
}

export interface OrganizationTopUserSummary {
  userId: string;
  email: string | null;
  aiRequests: number;
  creditsUsed: number;
  featuresUsed: string[];
  lastActivity: string | null;
}

/** Admin-only (gated by the API route, never by this function) — restricted to organizationId's own rows by getTopUsersForOrganization()'s database-level filter, so there is no code path here that can return another organization's members. */
export async function getOrganizationTopUsers(organizationId: string, range: DateRange, limit = 20): Promise<OrganizationTopUserSummary[]> {
  const rows = await getTopUsersForOrganization(organizationId, range, limit);

  return Promise.all(
    rows.map(async (row) => {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(row.userId);
      if (error) {
        console.error(`${LOG_PREFIX} Analytics query failed`, { source: "auth.users (organization top users)", error: error.message });
      }

      return {
        userId: row.userId,
        email: data?.user?.email ?? null,
        aiRequests: row.aiRequests,
        creditsUsed: row.creditsUsed,
        featuresUsed: row.featuresUsed,
        lastActivity: row.lastActivity,
      };
    })
  );
}

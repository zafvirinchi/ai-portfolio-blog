import { supabaseAdmin } from "../supabase/admin";
import { organizationService } from "../saas/organization-service";
import { listPlans } from "../billing/plan-service";

import { DateRange, LimitWarning, OrganizationMetrics, TopOrganizationRow } from "./analytics-types";
import { getOrganizationPlanMap } from "./subscription-analytics";
import { getUsageByOrganization, getUsageForOrganization, getFeatureUsageForOrganization, OrganizationFeatureUsageRow, creditsToCents } from "./ai-usage-analytics";

const LOG_PREFIX = "[analytics]";
const NEAR_LIMIT_THRESHOLD = 0.9;

/** Must match credit-service.ts's own periodStartIso() exactly (not exported from that file) — the calendar-month key credit_balances rows are keyed by. */
function currentPeriodStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

interface CreditBalanceRow {
  organization_id: string;
  monthly_limit: number | null;
  reserved: number;
  consumed: number;
}

async function fetchCurrentCreditBalances(): Promise<Map<string, CreditBalanceRow>> {
  const { data, error } = await supabaseAdmin
    .from("credit_balances")
    .select("organization_id, monthly_limit, reserved, consumed")
    .eq("period_start", currentPeriodStartIso());

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "credit_balances", error: error.message });
    return new Map();
  }

  return new Map((data ?? []).map((row) => [row.organization_id, row]));
}

async function fetchMemberCountsByOrganization(): Promise<Map<string, number>> {
  const { data, error } = await supabaseAdmin.from("organization_members").select("organization_id").limit(20_000);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "organization_members", error: error.message });
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
  }
  return counts;
}

/** Single-organization-scoped counterparts of the two platform-wide fetchers above — used by the self-serve path so a customer's request never scans every organization's rows just to read their own. */
async function fetchCurrentCreditBalanceForOrganization(organizationId: string): Promise<CreditBalanceRow | null> {
  const { data, error } = await supabaseAdmin
    .from("credit_balances")
    .select("organization_id, monthly_limit, reserved, consumed")
    .eq("organization_id", organizationId)
    .eq("period_start", currentPeriodStartIso())
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "credit_balances (single organization)", error: error.message });
    return null;
  }

  return data;
}

async function fetchMemberCountForOrganization(organizationId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.from("organization_members").select("id").eq("organization_id", organizationId);

  if (error) {
    console.error(`${LOG_PREFIX} Analytics query failed`, { source: "organization_members (single organization)", error: error.message });
    return 0;
  }

  return (data ?? []).length;
}

export async function getOrganizationMetrics(range: DateRange, topLimit = 20): Promise<OrganizationMetrics> {
  const [organizations, planByOrg, usageByOrg, creditBalances, memberCounts, plans] = await Promise.all([
    organizationService.listAll(),
    getOrganizationPlanMap(),
    getUsageByOrganization(range),
    fetchCurrentCreditBalances(),
    fetchMemberCountsByOrganization(),
    listPlans(),
  ]);

  const planByKey = new Map(plans.map((plan) => [plan.key, plan]));

  const activeOrganizations = organizations.filter((org) => org.status === "active").length;
  const paidOrganizations = organizations.filter((org) => planByOrg.has(org.id)).length;

  let totalSeats = 0;
  let seatCapacity = 0;
  let totalCredits = 0;

  const topOrganizations: TopOrganizationRow[] = [];
  const organizationsNearLimits: LimitWarning[] = [];

  for (const org of organizations) {
    const planKey = planByOrg.get(org.id) ?? "free";
    const plan = planByKey.get(planKey);
    const seats = memberCounts.get(org.id) ?? 0;
    const seatLimit = plan?.limits.organization_seats ?? null;
    const balance = creditBalances.get(org.id);
    const usage = usageByOrg.get(org.id);

    totalSeats += seats;
    if (seatLimit !== null && seatLimit !== undefined) seatCapacity += seatLimit;

    const orgCredits = usage?.credits ?? 0;
    totalCredits += orgCredits;

    const creditsUsagePercent =
      balance && balance.monthly_limit && balance.monthly_limit > 0 ? Math.min(100, Math.round(((balance.reserved + balance.consumed) / balance.monthly_limit) * 100)) : null;

    topOrganizations.push({
      organizationId: org.id,
      organizationName: org.name,
      planKey,
      seats,
      activeUsers: usage?.activeUsers.size ?? 0,
      aiCreditsUsed: orgCredits,
      estimatedAiCostCents: creditsToCents(orgCredits),
      usagePercent: creditsUsagePercent,
      lastActivity: usage?.lastActivity ?? null,
    });

    if (creditsUsagePercent !== null && creditsUsagePercent / 100 >= NEAR_LIMIT_THRESHOLD) {
      organizationsNearLimits.push({
        organizationId: org.id,
        organizationName: org.name,
        limitType: "credits",
        usagePercent: creditsUsagePercent,
        description: `${org.name} has used ${creditsUsagePercent}% of its monthly AI credits.`,
      });
    }

    if (seatLimit !== null && seatLimit !== undefined && seatLimit > 0 && seats / seatLimit >= NEAR_LIMIT_THRESHOLD) {
      const seatPercent = Math.round((seats / seatLimit) * 100);
      organizationsNearLimits.push({
        organizationId: org.id,
        organizationName: org.name,
        limitType: "seats",
        usagePercent: seatPercent,
        description: `${org.name} has used ${seatPercent}% of its organization seats (${seats}/${seatLimit}).`,
      });
    }
  }

  return {
    totalOrganizations: organizations.length,
    activeOrganizations,
    paidOrganizations,
    totalSeats,
    seatUtilizationPercent: seatCapacity > 0 ? Math.round((totalSeats / seatCapacity) * 100) : null,
    aiCreditsUsed: totalCredits,
    estimatedAiCostCents: creditsToCents(totalCredits),
    topOrganizations: topOrganizations.sort((a, b) => b.aiCreditsUsed - a.aiCreditsUsed).slice(0, topLimit),
    organizationsNearLimits: organizationsNearLimits.sort((a, b) => b.usagePercent - a.usagePercent),
  };
}

export interface OrganizationSelfMetrics {
  organizationId: string;
  planKey: string;
  seats: number;
  seatLimit: number | null;
  availableSeats: number | null;
  activeUsers: number;
  aiCreditsUsed: number;
  /** Never surfaced to a normal customer by the API layer — kept here because it's a natural byproduct of the same computation and other internal callers may want it. See PHASE14_MILESTONE6 docs, Privacy. */
  estimatedAiCostCents: number;
  creditsMonthlyLimit: number | null;
  creditsRemaining: number | null;
  creditsUsagePercent: number | null;
  /** Same formula as usage-service.ts's getBalance() — the next calendar-month start after the current credit period. */
  creditsResetDate: string;
  lastActivity: string | null;
  featureUsage: OrganizationFeatureUsageRow[];
}

/**
 * The single-organization view backing GET /api/organization/analytics —
 * every query here is already scoped to one organizationId at the
 * database level (never a platform-wide fetch filtered down client-
 * side), so there is no risk of leaking another organization's data
 * through this path, and a single customer's request never scans every
 * organization's rows.
 */
export async function getOrganizationSelfMetrics(organizationId: string, range: DateRange): Promise<OrganizationSelfMetrics> {
  const [planByOrg, usage, balance, seats, featureUsage, plans] = await Promise.all([
    getOrganizationPlanMap(),
    getUsageForOrganization(organizationId, range),
    fetchCurrentCreditBalanceForOrganization(organizationId),
    fetchMemberCountForOrganization(organizationId),
    getFeatureUsageForOrganization(organizationId, range),
    listPlans(),
  ]);

  const planKey = planByOrg.get(organizationId) ?? "free";
  const plan = plans.find((p) => p.key === planKey);
  const seatLimit = plan?.limits.organization_seats ?? null;
  const credits = usage.credits;

  const monthlyLimit = balance?.monthly_limit ?? null;
  const consumedAndReserved = balance ? balance.reserved + balance.consumed : 0;

  const resetDate = new Date(currentPeriodStartIso());
  resetDate.setUTCMonth(resetDate.getUTCMonth() + 1);

  return {
    organizationId,
    planKey,
    seats,
    seatLimit,
    availableSeats: seatLimit === null ? null : Math.max(0, seatLimit - seats),
    activeUsers: usage.activeUsers.size,
    aiCreditsUsed: credits,
    estimatedAiCostCents: creditsToCents(credits),
    creditsMonthlyLimit: monthlyLimit,
    creditsRemaining: monthlyLimit === null ? null : Math.max(0, monthlyLimit - consumedAndReserved),
    creditsUsagePercent: monthlyLimit && monthlyLimit > 0 ? Math.min(100, Math.round((consumedAndReserved / monthlyLimit) * 100)) : null,
    creditsResetDate: resetDate.toISOString(),
    lastActivity: usage.lastActivity,
    featureUsage,
  };
}

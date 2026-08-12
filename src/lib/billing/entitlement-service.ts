import { createOverride, EntitlementOverride, listActiveOverrides } from "./entitlement-overrides-service";
import { isAdmin, resolvePlatformRoles } from "./persona-service";
import { getDefaultPlanForRole, getFeatureEntitlement, PLATFORM_PLAN_DEFINITIONS } from "./platform-plan-registry";
import {
  FEATURE_IDS,
  FeatureAccessLevel,
  FeatureEntitlementDefinition,
  FeatureId,
  PlatformPlanKey,
  PlatformRole,
  SubscriptionStatus,
  UsageMetric,
  UsagePeriod,
} from "./platform-schema";
import { getUsageCount, recordUsageEvent } from "./usage-event-service";

// Phase 18 Milestone 1 — Step 6. THE one centralized entitlement
// service. Every function here derives identity/role/plan/usage
// entirely server-side (resolvePlatformRoles() reads Supabase
// app_metadata; usage is read from platform_usage_events by userId) —
// nothing in this file ever accepts a planId, role, entitlement, or
// usage count as an input parameter that gets trusted as truth. The
// ONLY externally-supplied value any function here takes is a userId,
// and every route wiring this in resolves that userId itself from a
// real Supabase session (persona-service.ts's getOptionalUserId()),
// never from a request body or query parameter.

// ---------------------------------------------------------------------------
// Step 7 — Plan resolution.
// ---------------------------------------------------------------------------

export interface ResolvedPlatformPlan {
  role: PlatformRole;
  /** null only for ADMIN — a privileged role, never a plan tier. */
  planKey: PlatformPlanKey | null;
  status: SubscriptionStatus;
  /** True whenever this is the safe FREE default with no real persisted plan/subscription behind it — mirrors billing/subscription-service.ts's ResolvedSubscription.isImplicitFree exactly. Always true this milestone (no payment provider exists yet to ever make it false). */
  isImplicitFree: boolean;
}

/**
 * One resolved plan PER ROLE — deliberately plural (Step 2: "do not
 * assume a user can only ever have one role"). A user with both
 * JOB_SEEKER and RECRUITER resolves to two plans; entitlement checks
 * below take the most permissive result across all of them. FREE is
 * always the resolved plan this milestone (Step 7: "do not create fake
 * subscriptions" — no payment provider exists yet to ever justify
 * anything else).
 */
export async function resolveEffectivePlans(userId: string): Promise<ResolvedPlatformPlan[]> {
  const roles = await resolvePlatformRoles(userId);

  return roles.map((role) => ({
    role,
    planKey: getDefaultPlanForRole(role),
    status: "active" as SubscriptionStatus,
    isImplicitFree: true,
  }));
}

// ---------------------------------------------------------------------------
// Step 5/6/10 — Feature entitlement, admin bypass, and overrides.
// ---------------------------------------------------------------------------

export type EntitlementSource = "ADMIN_BYPASS" | "OVERRIDE_GRANTED" | "OVERRIDE_REVOKED" | "PLAN";

export interface FeatureEntitlementResult extends FeatureEntitlementDefinition {
  featureId: FeatureId;
  source: EntitlementSource;
}

function mostPermissive(entitlements: FeatureEntitlementDefinition[]): FeatureEntitlementDefinition {
  if (entitlements.some((e) => e.access === "UNLIMITED")) return { access: "UNLIMITED" };

  const limited = entitlements.filter((e): e is Required<Pick<FeatureEntitlementDefinition, "limit">> & FeatureEntitlementDefinition => e.access === "LIMITED" && typeof e.limit === "number");
  if (limited.length > 0) {
    return limited.reduce((best, entry) => (entry.limit > best.limit! ? entry : best));
  }

  return { access: "NONE" };
}

/**
 * The one place a feature access decision is made. Order of authority,
 * highest first: ADMIN role (full bypass) > an active REVOKED override
 * (blocks even a plan that would otherwise allow it — e.g. abuse
 * response) > an active GRANTED override (unlocks a feature outside any
 * plan — promotional/beta/enterprise access, Step 10) > the most
 * permissive of the user's resolved plans (Step 2's multi-role
 * requirement). Every step is server-derived; nothing here reads a
 * client-supplied plan/role/entitlement.
 */
export async function getEntitlement(userId: string, featureId: FeatureId): Promise<FeatureEntitlementResult> {
  const roles = await resolvePlatformRoles(userId);

  if (isAdmin(roles)) {
    return { featureId, access: "UNLIMITED", source: "ADMIN_BYPASS" };
  }

  const overrides = await listActiveOverrides(userId);
  const override = overrides.find((entry) => entry.feature_id === featureId);

  if (override?.access === "REVOKED") {
    return { featureId, access: "NONE", source: "OVERRIDE_REVOKED" };
  }

  if (override?.access === "GRANTED") {
    return { featureId, access: "UNLIMITED", source: "OVERRIDE_GRANTED" };
  }

  const plans = roles.map((role) => getDefaultPlanForRole(role)).filter((key): key is PlatformPlanKey => key !== null);
  const resolved = mostPermissive(plans.map((planKey) => getFeatureEntitlement(planKey, featureId)));

  return { featureId, ...resolved, source: "PLAN" };
}

export async function canAccess(userId: string, featureId: FeatureId): Promise<boolean> {
  const entitlement = await getEntitlement(userId, featureId);
  return entitlement.access !== "NONE";
}

export class FeatureNotEntitledError extends Error {
  constructor(public featureId: FeatureId) {
    super(`This feature (${featureId}) isn't included in your current plan.`);
    this.name = "FeatureNotEntitledError";
  }
}

export async function requireFeature(userId: string, featureId: FeatureId): Promise<void> {
  const entitlement = await getEntitlement(userId, featureId);
  if (entitlement.access === "NONE") {
    throw new FeatureNotEntitledError(featureId);
  }
}

// ---------------------------------------------------------------------------
// Step 8 — Usage + quota.
// ---------------------------------------------------------------------------

export interface UsageSummary {
  metric: UsageMetric;
  usedToday: number;
  usedThisMonth: number;
  usedLifetime: number;
}

export async function getUsage(userId: string, metric: UsageMetric): Promise<UsageSummary> {
  const [usedToday, usedThisMonth, usedLifetime] = await Promise.all([
    getUsageCount(userId, metric, "DAY"),
    getUsageCount(userId, metric, "MONTH"),
    getUsageCount(userId, metric, "LIFETIME"),
  ]);

  return { metric, usedToday, usedThisMonth, usedLifetime };
}

export interface QuotaCheckResult {
  metric: UsageMetric;
  allowed: boolean;
  used: number;
  /** null = unlimited. */
  limit: number | null;
  period: UsagePeriod;
  /** null = unlimited. */
  remaining: number | null;
}

/** Every FeatureId whose entitlement, in ANY plan definition, is governed by this metric — the metric's usage pool is shared across all of them (e.g. resume.jd.match/job.match/job.analyzer all draw from JD_MATCHES). */
function featuresUsingMetric(metric: UsageMetric): FeatureId[] {
  return FEATURE_IDS.filter((id) => Object.values(PLATFORM_PLAN_DEFINITIONS).some((plan) => plan.features[id]?.metric === metric));
}

export async function checkQuota(userId: string, metric: UsageMetric): Promise<QuotaCheckResult> {
  const roles = await resolvePlatformRoles(userId);

  if (isAdmin(roles)) {
    return { metric, allowed: true, used: 0, limit: null, period: "MONTH", remaining: null };
  }

  const relevantFeatures = featuresUsingMetric(metric);
  const entitlements = await Promise.all(relevantFeatures.map((featureId) => getEntitlement(userId, featureId)));
  const resolved = mostPermissive(entitlements);

  if (resolved.access === "NONE") {
    return { metric, allowed: false, used: 0, limit: 0, period: "MONTH", remaining: 0 };
  }

  if (resolved.access === "UNLIMITED") {
    const used = await getUsageCount(userId, metric, "MONTH");
    return { metric, allowed: true, used, limit: null, period: "MONTH", remaining: null };
  }

  const period = resolved.period ?? "MONTH";
  const limit = resolved.limit ?? 0;
  const used = await getUsageCount(userId, metric, period);
  const remaining = Math.max(0, limit - used);

  return { metric, allowed: used < limit, used, limit, period, remaining };
}

export class QuotaExceededError extends Error {
  constructor(
    public metric: UsageMetric,
    public limit: number,
    public used: number,
    public period: UsagePeriod
  ) {
    super(`${period} limit reached for ${metric} (${used}/${limit} used). Upgrade your plan for more.`);
    this.name = "QuotaExceededError";
  }
}

export async function requireQuota(userId: string, metric: UsageMetric): Promise<void> {
  const result = await checkQuota(userId, metric);

  if (!result.allowed) {
    throw new QuotaExceededError(metric, result.limit ?? 0, result.used, result.period);
  }
}

/**
 * Records ONE unit of usage against `metric` — callers must only ever
 * invoke this AFTER the real billable operation has actually succeeded
 * (Step 8's own explicit rule; see usage-event-service.ts's recordUsageEvent()
 * doc comment). Never throws.
 */
export async function recordUsage(userId: string, metric: UsageMetric): Promise<void> {
  await recordUsageEvent(userId, metric);
}

// ---------------------------------------------------------------------------
// Step 10 — Admin overrides. Both functions require the ACTING user to
// already resolve as ADMIN — enforced here, not left to the caller, so
// this is the one place that guarantee actually lives.
// ---------------------------------------------------------------------------

export class NotAuthorizedError extends Error {
  constructor() {
    super("Only administrators can manage entitlement overrides.");
    this.name = "NotAuthorizedError";
  }
}

export async function grantFeatureOverride(
  actingAdminUserId: string,
  targetUserId: string,
  featureId: FeatureId,
  options?: { reason?: string; expiresAt?: string }
): Promise<EntitlementOverride> {
  const actingRoles = await resolvePlatformRoles(actingAdminUserId);
  if (!isAdmin(actingRoles)) throw new NotAuthorizedError();

  return createOverride({
    userId: targetUserId,
    featureId,
    access: "GRANTED",
    grantedBy: actingAdminUserId,
    reason: options?.reason,
    expiresAt: options?.expiresAt ?? null,
  });
}

export async function revokeFeatureOverride(
  actingAdminUserId: string,
  targetUserId: string,
  featureId: FeatureId,
  options?: { reason?: string; expiresAt?: string }
): Promise<EntitlementOverride> {
  const actingRoles = await resolvePlatformRoles(actingAdminUserId);
  if (!isAdmin(actingRoles)) throw new NotAuthorizedError();

  return createOverride({
    userId: targetUserId,
    featureId,
    access: "REVOKED",
    grantedBy: actingAdminUserId,
    reason: options?.reason,
    expiresAt: options?.expiresAt ?? null,
  });
}

// ---------------------------------------------------------------------------
// Step 17 — Billing dashboard contract. A future milestone (M3, per this
// milestone's own instructions) wires this into a route + UI; nothing
// here is exposed to a client-facing route in Milestone 1.
// ---------------------------------------------------------------------------

export interface FeatureEntitlementSummary {
  featureId: FeatureId;
  access: FeatureAccessLevel;
  limit: number | null;
  period: UsagePeriod | null;
}

export interface BillingOverview {
  // Deliberately arrays, not singulars — Step 2's own multi-role
  // requirement takes precedence over Step 17's single-value example
  // shape (which predates that requirement in the same spec).
  roles: PlatformRole[];
  plans: PlatformPlanKey[];
  status: SubscriptionStatus;
  isImplicitFree: boolean;
  features: FeatureEntitlementSummary[];
  usage: UsageSummary[];
  renewalDate?: string;
  cancelAtPeriodEnd?: boolean;
}

export async function getBillingOverview(userId: string): Promise<BillingOverview> {
  const plans = await resolveEffectivePlans(userId);

  const features = await Promise.all(
    FEATURE_IDS.map(async (featureId) => {
      const entitlement = await getEntitlement(userId, featureId);
      return { featureId, access: entitlement.access, limit: entitlement.limit ?? null, period: entitlement.period ?? null };
    })
  );

  const metrics = Array.from(new Set(Object.values(PLATFORM_PLAN_DEFINITIONS).flatMap((plan) => Object.values(plan.features).map((entry) => entry.metric).filter((metric): metric is UsageMetric => Boolean(metric)))));
  const usage = await Promise.all(metrics.map((metric) => getUsage(userId, metric)));

  return {
    roles: plans.map((plan) => plan.role),
    plans: plans.map((plan) => plan.planKey).filter((key): key is PlatformPlanKey => key !== null),
    status: "active",
    isImplicitFree: plans.every((plan) => plan.isImplicitFree),
    features,
    usage,
    // No real subscription exists yet — never fabricated (Step 11:
    // "never fabricate subscription/payment state").
    renewalDate: undefined,
    cancelAtPeriodEnd: undefined,
  };
}

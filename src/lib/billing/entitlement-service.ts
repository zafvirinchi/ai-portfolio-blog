import { AsyncLocalStorage } from "node:async_hooks";

import { createOverride, EntitlementOverride, listActiveOverrides, revokeOverride } from "./entitlement-overrides-service";
import { isAdmin, resolvePlatformRoles } from "./persona-service";
import { getDefaultPlanForRole, getFeatureEntitlement, PLATFORM_PLAN_DEFINITIONS } from "./platform-plan-registry";
import {
  FEATURE_IDS,
  FeatureAccessLevel,
  FeatureEntitlementDefinition,
  FeatureId,
  PlatformPlanKey,
  PlatformRole,
  PlatformSubscriptionStatus,
  UsageMetric,
  UsagePeriod,
} from "./platform-schema";
import { listSubscriptionsForUser, pickBestSubscriptionForRole, PlatformSubscriptionRow } from "./platform-subscription-service";
import { getUsageCount, recordUsageEvent } from "./usage-event-service";

// ---------------------------------------------------------------------------
// Phase 19 Milestone 4, Step 12/13 — request/call-scoped entitlement
// memoization. Audit finding: getBillingOverview() calls getEntitlement()
// once per FEATURE_ID (25 today) via Promise.all — each independent call
// re-runs resolveEffectivePlans() (a role lookup + a subscription
// lookup) and listActiveOverrides() from scratch, so one /settings/billing
// page load previously issued roughly 75 Supabase lookups for data that
// is identical across all 25 calls (same userId, same request).
// checkQuota() has the same shape for any metric shared by more than one
// feature (up to 3x for JD_MATCHES today).
//
// Fixed with a plain Map cache scoped by AsyncLocalStorage, established
// fresh by withEntitlementCache() around exactly the call sites proven
// to have internal repetition (getBillingOverview() below, checkQuota()
// below, and platform-admin-service.ts's getPlatformUserDetail(), which
// has the identical 25-feature loop for the admin user-detail view) —
// never module-global, never persistent: a new Map is created on every
// withEntitlementCache() call, AsyncLocalStorage guarantees concurrent
// requests each see their own store even for the same userId, and the
// store is garbage-collected the moment the wrapped call returns.
// Callers OUTSIDE an active scope (e.g. a single requireFeature() call
// on its own) are completely unaffected — the lookup functions fall
// back to calling straight through, identical to before this milestone.
// ---------------------------------------------------------------------------

interface EntitlementCacheStore {
  roles: Map<string, Promise<PlatformRole[]>>;
  subscriptions: Map<string, Promise<PlatformSubscriptionRow[]>>;
  overrides: Map<string, Promise<EntitlementOverride[]>>;
}

const entitlementCacheContext = new AsyncLocalStorage<EntitlementCacheStore>();

function cachedRolesLookup(userId: string): Promise<PlatformRole[]> {
  const store = entitlementCacheContext.getStore();
  if (!store) return resolvePlatformRoles(userId);

  let cached = store.roles.get(userId);
  if (!cached) {
    cached = resolvePlatformRoles(userId);
    store.roles.set(userId, cached);
  }
  return cached;
}

function cachedSubscriptionsLookup(userId: string): Promise<PlatformSubscriptionRow[]> {
  const store = entitlementCacheContext.getStore();
  if (!store) return listSubscriptionsForUser(userId);

  let cached = store.subscriptions.get(userId);
  if (!cached) {
    cached = listSubscriptionsForUser(userId);
    store.subscriptions.set(userId, cached);
  }
  return cached;
}

function cachedOverridesLookup(userId: string): Promise<EntitlementOverride[]> {
  const store = entitlementCacheContext.getStore();
  if (!store) return listActiveOverrides(userId);

  let cached = store.overrides.get(userId);
  if (!cached) {
    cached = listActiveOverrides(userId);
    store.overrides.set(userId, cached);
  }
  return cached;
}

/**
 * Wraps `fn` in a fresh, call-scoped entitlement cache. Exported so
 * other files whose own loop resolves entitlement for many features (or
 * many metrics) for the SAME user within one logical operation can opt
 * in without duplicating this caching logic — see
 * platform-admin-service.ts's getPlatformUserDetail(). A nested call
 * (a scope already active when this runs) simply shadows the outer one
 * with a fresh, empty cache for its own duration — always correct,
 * never stale, just a missed optimization in that specific nested case
 * rather than a bug.
 */
export function withEntitlementCache<T>(fn: () => Promise<T>): Promise<T> {
  return entitlementCacheContext.run({ roles: new Map(), subscriptions: new Map(), overrides: new Map() }, fn);
}

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
  status: PlatformSubscriptionStatus;
  /** True whenever this is the safe FREE default with no real Stripe subscription behind it — mirrors billing/subscription-service.ts's ResolvedSubscription.isImplicitFree exactly. */
  isImplicitFree: boolean;
  /** Real Stripe values when isImplicitFree is false; always null/false for the FREE default — never fabricated (Step 12/17). */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * One resolved plan PER ROLE — deliberately plural (Step 2: "do not
 * assume a user can only ever have one role"). A user with both
 * JOB_SEEKER and RECRUITER resolves to two plans; entitlement checks
 * below take the most permissive result across all of them.
 *
 * Phase 18 Milestone 2 — extended (the ONE place this changed; every
 * downstream consumer — getEntitlement()/checkQuota()/etc. — needed NO
 * changes, since they already only care about the resolved planKey, not
 * how it was resolved). For each role, a real paid-access Stripe
 * subscription in that role's plan family (platform-subscription-
 * service.ts's pickBestSubscriptionForRole(), itself fail-closed on any
 * lookup error) wins; otherwise the role's FREE default — Step 7's
 * "FREE is the safe default" rule, now genuinely exercised rather than
 * hardcoded.
 */
export async function resolveEffectivePlans(userId: string): Promise<ResolvedPlatformPlan[]> {
  const roles = await cachedRolesLookup(userId);
  const subscriptions = await cachedSubscriptionsLookup(userId);

  return roles.map((role) => {
    const stripeBacked = pickBestSubscriptionForRole(subscriptions, role);

    if (stripeBacked) {
      return {
        role,
        planKey: stripeBacked.plan_id,
        status: stripeBacked.status,
        isImplicitFree: false,
        currentPeriodEnd: stripeBacked.current_period_end,
        cancelAtPeriodEnd: stripeBacked.cancel_at_period_end,
      };
    }

    return {
      role,
      planKey: getDefaultPlanForRole(role),
      status: "active",
      isImplicitFree: true,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  });
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
  // Phase 18 Milestone 2 — routed through resolveEffectivePlans() (not
  // getDefaultPlanForRole() directly, M1's original shortcut) so a real
  // Stripe-backed plan actually takes effect here — this single change
  // is what connects Stripe to every existing canAccess()/checkQuota()/
  // requireFeature() caller with no changes needed to any of them.
  const plans = await resolveEffectivePlans(userId);
  const roles = plans.map((plan) => plan.role);

  if (isAdmin(roles)) {
    return { featureId, access: "UNLIMITED", source: "ADMIN_BYPASS" };
  }

  const overrides = await cachedOverridesLookup(userId);
  const override = overrides.find((entry) => entry.feature_id === featureId);

  if (override?.access === "REVOKED") {
    return { featureId, access: "NONE", source: "OVERRIDE_REVOKED" };
  }

  if (override?.access === "GRANTED") {
    return { featureId, access: "UNLIMITED", source: "OVERRIDE_GRANTED" };
  }

  const planKeys = plans.map((plan) => plan.planKey).filter((key): key is PlatformPlanKey => key !== null);
  const resolved = mostPermissive(planKeys.map((planKey) => getFeatureEntitlement(planKey, featureId)));

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
  // Step 12/13 — a metric shared by more than one feature (e.g.
  // JD_MATCHES: resume.jd.match/job.match/job.analyzer) would otherwise
  // re-resolve this same user's roles/subscriptions/overrides once per
  // relevant feature below; wrapping the whole check in one cache scope
  // collapses that back down to a single lookup of each.
  return withEntitlementCache(() => checkQuotaUncached(userId, metric));
}

async function checkQuotaUncached(userId: string, metric: UsageMetric): Promise<QuotaCheckResult> {
  const roles = await cachedRolesLookup(userId);

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

/**
 * Phase 18 Milestone 3 — "remove an override" (deactivate an EXISTING
 * override row by its own id), distinct from grantFeatureOverride()/
 * revokeFeatureOverride() above (which each CREATE a new row expressing
 * a decision for a feature). Equally admin-gated, re-derived from the
 * acting user's real session role on every call.
 */
export async function deactivateEntitlementOverride(actingAdminUserId: string, overrideId: string): Promise<void> {
  const actingRoles = await resolvePlatformRoles(actingAdminUserId);
  if (!isAdmin(actingRoles)) throw new NotAuthorizedError();

  await revokeOverride(overrideId);
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

/**
 * Phase 18 Milestone 2 — one summary PER ROLE, replacing M1's single
 * flat status/renewalDate/cancelAtPeriodEnd. A single flattened status
 * genuinely can't represent reality once Stripe is real: a multi-role
 * user (Step 3) could be `active` on a Job Seeker Pro subscription while
 * having no Recruiter subscription (implicit Free) at the same time —
 * collapsing that to one status would misrepresent one role or the
 * other. This is a deliberate, documented evolution of M1's own
 * contract now that there's real per-role data to report, not a
 * breaking change made carelessly.
 */
export interface PlanSummary {
  role: PlatformRole;
  planKey: PlatformPlanKey | null;
  planName: string | null;
  status: PlatformSubscriptionStatus;
  isImplicitFree: boolean;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Phase 19 Milestone 4, Step 2/3 — extends UsageSummary with the SAME
 * limit/period the real checkQuota() enforces for this metric, so
 * /settings/billing can render a progress bar/percentage/remaining
 * count without re-deriving quota math client-side (which would risk
 * drifting from the real enforcement in checkQuotaUncached() below).
 * `limit`/`period` null means unlimited (ADMIN bypass, an UNLIMITED
 * plan tier, or an override) — mirrors QuotaCheckResult's own
 * null-means-unlimited convention exactly.
 */
export interface UsageWithLimit extends UsageSummary {
  limit: number | null;
  period: UsagePeriod | null;
}

export interface BillingOverview {
  roles: PlatformRole[];
  plans: PlanSummary[];
  features: FeatureEntitlementSummary[];
  usage: UsageWithLimit[];
}

export async function getBillingOverview(userId: string): Promise<BillingOverview> {
  // Step 12/13/14 — this is the worst offender the audit found: every
  // one of the 25 FEATURE_IDS below independently re-ran
  // resolveEffectivePlans() (a role + subscription lookup) and
  // listActiveOverrides() for the exact same user. One cache scope
  // around the whole function collapses ~75 redundant lookups to 2
  // (one role, one subscription — overrides are looked up once too),
  // with no change to the returned data.
  return withEntitlementCache(() => getBillingOverviewUncached(userId));
}

async function getBillingOverviewUncached(userId: string): Promise<BillingOverview> {
  const plans = await resolveEffectivePlans(userId);

  const features = await Promise.all(
    FEATURE_IDS.map(async (featureId) => {
      const entitlement = await getEntitlement(userId, featureId);
      return { featureId, access: entitlement.access, limit: entitlement.limit ?? null, period: entitlement.period ?? null };
    })
  );

  const metrics = Array.from(new Set(Object.values(PLATFORM_PLAN_DEFINITIONS).flatMap((plan) => Object.values(plan.features).map((entry) => entry.metric).filter((metric): metric is UsageMetric => Boolean(metric)))));
  const usage = await Promise.all(
    metrics.map(async (metric) => {
      const summary = await getUsage(userId, metric);

      // Step 2/3 — the SAME resolution checkQuotaUncached() performs
      // (mostPermissive across every feature sharing this metric), just
      // read from the `features` array already computed above instead
      // of re-querying — zero extra Supabase calls, zero risk of
      // disagreeing with the real enforcement.
      const relevantFeatureIds = new Set(featuresUsingMetric(metric));
      const relevantEntitlements = features.filter((f) => relevantFeatureIds.has(f.featureId));
      const resolved = mostPermissive(relevantEntitlements.map((f) => ({ access: f.access, limit: f.limit ?? undefined, period: f.period ?? undefined })));

      const limit = resolved.access === "UNLIMITED" ? null : resolved.access === "NONE" ? 0 : (resolved.limit ?? null);
      const period = resolved.access === "LIMITED" ? (resolved.period ?? null) : null;

      return { ...summary, limit, period };
    })
  );

  return {
    roles: plans.map((plan) => plan.role),
    plans: plans.map((plan) => ({
      role: plan.role,
      planKey: plan.planKey,
      planName: plan.planKey ? PLATFORM_PLAN_DEFINITIONS[plan.planKey].name : null,
      status: plan.status,
      isImplicitFree: plan.isImplicitFree,
      // Never fabricated — null/false for the FREE default; real Stripe
      // values only when a real subscription backs this role's plan.
      renewalDate: plan.currentPeriodEnd,
      cancelAtPeriodEnd: plan.cancelAtPeriodEnd,
    })),
    features,
    usage,
  };
}

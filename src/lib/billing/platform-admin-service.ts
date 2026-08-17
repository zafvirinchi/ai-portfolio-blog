import * as auditService from "../saas/audit-service";
import { AuditLogEntry } from "../saas/organization-types";
import { supabaseAdmin } from "../supabase/admin";

import {
  deactivateEntitlementOverride,
  FeatureEntitlementResult,
  getEntitlement,
  getUsage,
  grantFeatureOverride,
  ResolvedPlatformPlan,
  resolveEffectivePlans,
  revokeFeatureOverride,
  UsageSummary,
  withEntitlementCache,
} from "./entitlement-service";
import { EntitlementOverride, getOverrideById, listAllOverridesForUser } from "./entitlement-overrides-service";
import { resolvePlatformRoles, setPlatformRoles } from "./persona-service";
import { FEATURE_IDS, FeatureId, PLATFORM_ROLES, PlatformRole, UsageMetric, USAGE_METRICS } from "./platform-schema";
import { getCustomerByUserId, listSubscriptionsForUser, PlatformBillingCustomer, PlatformSubscriptionRow } from "./platform-subscription-service";

const LOG_PREFIX = "[billing:platform-admin]";
const AUDIT_OBJECT_TYPE = "platform_user";
const MAX_USER_PAGES = 20;
const USERS_PER_PAGE = 1000;
const SEARCH_RESULT_LIMIT = 50;

// Phase 18 Milestone 3 — the ONE admin-workflow layer built ON TOP of
// M1's entitlement-service.ts and M2's platform-subscription-service.ts
// (both reused unmodified in their actual decision logic — this file
// adds user search, cross-cutting aggregation for the admin UI, role-
// change safety guards, and audit logging; it never re-implements a
// feature/quota/plan decision itself). Every mutating function here
// takes the ACTING admin's userId as an explicit parameter — routes
// resolve that via persona-service.ts's requirePlatformAdmin() from the
// real Supabase session, never from a request body.

export class InvalidPersonaError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a valid persona/role.`);
    this.name = "InvalidPersonaError";
  }
}

export class InvalidFeatureIdError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a valid feature id.`);
    this.name = "InvalidFeatureIdError";
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super("No user exists with that id.");
    this.name = "UserNotFoundError";
  }
}

export class OverrideNotFoundError extends Error {
  constructor() {
    super("No entitlement override exists with that id.");
    this.name = "OverrideNotFoundError";
  }
}

export class LastAdminError extends Error {
  constructor() {
    super("Cannot remove ADMIN from the last remaining administrator — grant ADMIN to another account first.");
    this.name = "LastAdminError";
  }
}

export class SelfLockoutConfirmationRequiredError extends Error {
  constructor() {
    super("You are removing your own ADMIN role — resubmit with confirmSelfRemoval: true to proceed.");
    this.name = "SelfLockoutConfirmationRequiredError";
  }
}

function isPlatformRole(value: string): value is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(value);
}

function isFeatureId(value: string): value is FeatureId {
  return (FEATURE_IDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Scope A — admin user lookup. Reuses supabaseAdmin.auth.admin.getUserById()/
// listUsers() directly (the same Supabase Admin API src/lib/analytics/
// user-analytics.ts's listAllAuthUsers() and persona-service.ts already
// use) — no new user table. listUsers() has no server-side email/role
// filter in this SDK version, so matching is done locally over paginated
// results, same as every other admin/analytics listing in this codebase.
// Returns only minimal PII (id/email/createdAt/roles) — never phone
// numbers, provider identities, or other Supabase Auth user fields.
// ---------------------------------------------------------------------------

export interface PlatformUserSummary {
  userId: string;
  email: string | null;
  createdAt: string;
  roles: PlatformRole[];
}

async function toSummary(userId: string, email: string | null, createdAt: string): Promise<PlatformUserSummary> {
  const roles = await resolvePlatformRoles(userId);
  return { userId, email, createdAt, roles };
}

export interface PlatformUserSearchQuery {
  email?: string;
  userId?: string;
  role?: string;
}

export async function searchPlatformUsers(query: PlatformUserSearchQuery): Promise<PlatformUserSummary[]> {
  if (query.userId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(query.userId);
    if (error || !data?.user) return [];
    return [await toSummary(data.user.id, data.user.email ?? null, data.user.created_at)];
  }

  const emailQuery = query.email?.trim().toLowerCase();
  const roleQuery = query.role && isPlatformRole(query.role) ? query.role : null;

  const results: PlatformUserSummary[] = [];

  for (let page = 1; page <= MAX_USER_PAGES && results.length < SEARCH_RESULT_LIMIT; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });

    if (error) {
      console.error(`${LOG_PREFIX} User search page failed`, error);
      break;
    }

    for (const user of data.users) {
      if (results.length >= SEARCH_RESULT_LIMIT) break;
      if (emailQuery && !user.email?.toLowerCase().includes(emailQuery)) continue;

      const roles = await resolvePlatformRoles(user.id);
      if (roleQuery && !roles.includes(roleQuery)) continue;

      results.push({ userId: user.id, email: user.email ?? null, createdAt: user.created_at, roles });
    }

    if (data.users.length < USERS_PER_PAGE) break;
  }

  return results;
}

/** Scans every user (bounded, same MAX_USER_PAGES cap) — only ever called for the ADMIN-removal safety check (§ role management), never on a hot path. */
async function countUsersWithRole(role: PlatformRole): Promise<number> {
  let count = 0;

  for (let page = 1; page <= MAX_USER_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) {
      console.error(`${LOG_PREFIX} Role count page failed`, error);
      break;
    }

    for (const user of data.users) {
      const roles = await resolvePlatformRoles(user.id);
      if (roles.includes(role)) count++;
    }

    if (data.users.length < USERS_PER_PAGE) break;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Scope D/E/C — the per-user admin detail view: roles, effective plans,
// every feature's resolved entitlement + source, override history,
// Stripe-backed billing state (M2, degrades honestly if unavailable —
// see platform-subscription-service.ts's own fail-closed-to-empty
// behavior), usage across every metric, and this user's own admin-
// action audit history.
// ---------------------------------------------------------------------------

export interface PlatformUserDetail {
  userId: string;
  email: string | null;
  createdAt: string;
  roles: PlatformRole[];
  plans: ResolvedPlatformPlan[];
  entitlements: FeatureEntitlementResult[];
  overrides: EntitlementOverride[];
  billingCustomer: PlatformBillingCustomer | null;
  subscriptions: PlatformSubscriptionRow[];
  usage: UsageSummary[];
  auditLog: AuditLogEntry[];
}

export async function getPlatformUserDetail(userId: string): Promise<PlatformUserDetail | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;

  // Phase 19 Milestone 4, Step 12/13 — the same 25-features-per-user
  // redundancy the audit found in getBillingOverview() (entitlement-
  // service.ts): resolveEffectivePlans() and each of the 25
  // getEntitlement() calls below independently re-resolved this same
  // user's roles/subscriptions/overrides. withEntitlementCache() (the
  // same request-scoped cache getBillingOverview() now uses) collapses
  // that back down to one lookup of each — reused here rather than
  // duplicating the caching logic in a second place.
  const [roles, plans, overrides, billingCustomer, subscriptions, entitlements, usage, auditLog] = await withEntitlementCache(() =>
    Promise.all([
      resolvePlatformRoles(userId),
      resolveEffectivePlans(userId),
      listAllOverridesForUser(userId),
      getCustomerByUserId(userId),
      listSubscriptionsForUser(userId),
      Promise.all(FEATURE_IDS.map((featureId) => getEntitlement(userId, featureId))),
      Promise.all(USAGE_METRICS.map((metric) => getUsage(userId, metric))),
      auditService.listByObject(AUDIT_OBJECT_TYPE, userId, 25),
    ])
  );

  return {
    userId,
    email: data.user.email ?? null,
    createdAt: data.user.created_at,
    roles,
    plans,
    entitlements,
    overrides,
    billingCustomer,
    subscriptions,
    usage,
    auditLog,
  };
}

// ---------------------------------------------------------------------------
// Scope E — a global, feature-level usage aggregate for the admin
// dashboard ("usage by feature"). "Usage by user" is already served by
// getPlatformUserDetail() above (search a user, see their own usage) —
// deliberately not ALSO building a global per-user usage dump here,
// which would tip into "a large analytics platform" (explicitly out of
// scope). One count query per metric — small, bounded, no raw event rows returned.
// ---------------------------------------------------------------------------

export interface FeatureUsageAggregate {
  metric: UsageMetric;
  totalEvents: number;
}

export async function aggregateUsageByFeature(sinceIso?: string): Promise<FeatureUsageAggregate[]> {
  return Promise.all(
    USAGE_METRICS.map(async (metric) => {
      let query = supabaseAdmin.from("platform_usage_events").select("id", { count: "exact", head: true }).eq("metric", metric);
      if (sinceIso) query = query.gte("occurred_at", sinceIso);

      const { count, error } = await query;

      if (error) {
        console.error(`${LOG_PREFIX} Usage aggregate failed, treating as zero`, { metric, error });
        return { metric, totalEvents: 0 };
      }

      return { metric, totalEvents: count ?? 0 };
    })
  );
}

// ---------------------------------------------------------------------------
// Scope B — role/persona management, with the required safety guards.
// ---------------------------------------------------------------------------

async function recordPlatformAdminAction(req: Request, actingAdminUserId: string, action: string, targetUserId: string): Promise<void> {
  await auditService.record(req, {
    action,
    objectType: AUDIT_OBJECT_TYPE,
    objectId: targetUserId,
    organizationId: null,
    userId: actingAdminUserId,
  });
}

export async function assignPlatformRole(req: Request, actingAdminUserId: string, targetUserId: string, role: string): Promise<PlatformRole[]> {
  if (!isPlatformRole(role)) throw new InvalidPersonaError(role);

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
  if (error || !data?.user) throw new UserNotFoundError();

  const current = await resolvePlatformRoles(targetUserId);
  if (current.includes(role)) return current; // idempotent no-op, nothing to log

  const updated = [...current, role];
  await setPlatformRoles(targetUserId, updated);
  await recordPlatformAdminAction(req, actingAdminUserId, "platform.role.assigned", targetUserId);

  return updated;
}

export async function removePlatformRole(
  req: Request,
  actingAdminUserId: string,
  targetUserId: string,
  role: string,
  options?: { confirmSelfRemoval?: boolean }
): Promise<PlatformRole[]> {
  if (!isPlatformRole(role)) throw new InvalidPersonaError(role);

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
  if (error || !data?.user) throw new UserNotFoundError();

  const current = await resolvePlatformRoles(targetUserId);
  if (!current.includes(role)) return current; // idempotent no-op

  if (role === "ADMIN") {
    // Step B — self-lockout guard: an admin removing their OWN admin
    // role must explicitly confirm, distinct from the absolute
    // last-admin block below (which applies regardless of who's asking).
    if (actingAdminUserId === targetUserId && !options?.confirmSelfRemoval) {
      throw new SelfLockoutConfirmationRequiredError();
    }

    const adminCount = await countUsersWithRole("ADMIN");
    if (adminCount <= 1) {
      throw new LastAdminError();
    }
  }

  const updated = current.filter((existing) => existing !== role);
  await setPlatformRoles(targetUserId, updated);
  await recordPlatformAdminAction(req, actingAdminUserId, "platform.role.removed", targetUserId);

  return updated;
}

// ---------------------------------------------------------------------------
// Scope C — entitlement override management. Every function below
// delegates the actual grant/revoke/deactivate DECISION (including the
// admin-authorization check) to entitlement-service.ts (M1) — this layer
// only adds featureId validation and audit logging.
// ---------------------------------------------------------------------------

export async function grantOverrideByAdmin(
  req: Request,
  actingAdminUserId: string,
  targetUserId: string,
  featureId: string,
  options?: { reason?: string; expiresAt?: string }
): Promise<EntitlementOverride> {
  if (!isFeatureId(featureId)) throw new InvalidFeatureIdError(featureId);

  const override = await grantFeatureOverride(actingAdminUserId, targetUserId, featureId, options);
  await recordPlatformAdminAction(req, actingAdminUserId, `platform.override.granted:${featureId}`, targetUserId);

  return override;
}

export async function revokeOverrideByAdmin(
  req: Request,
  actingAdminUserId: string,
  targetUserId: string,
  featureId: string,
  options?: { reason?: string; expiresAt?: string }
): Promise<EntitlementOverride> {
  if (!isFeatureId(featureId)) throw new InvalidFeatureIdError(featureId);

  const override = await revokeFeatureOverride(actingAdminUserId, targetUserId, featureId, options);
  await recordPlatformAdminAction(req, actingAdminUserId, `platform.override.revoked:${featureId}`, targetUserId);

  return override;
}

/** Resolves which user an overrideId belongs to (getOverrideById()) rather than requiring the caller to already know it — also doubles as existence validation: an unknown overrideId fails here with OverrideNotFoundError before deactivateEntitlementOverride() is ever called. */
export async function deactivateOverrideByAdmin(req: Request, actingAdminUserId: string, overrideId: string): Promise<void> {
  const override = await getOverrideById(overrideId);
  if (!override) throw new OverrideNotFoundError();

  await deactivateEntitlementOverride(actingAdminUserId, overrideId);
  await recordPlatformAdminAction(req, actingAdminUserId, `platform.override.deactivated:${override.feature_id}`, override.user_id);
}

// ---------------------------------------------------------------------------
// Shared error -> HTTP status mapping, so every /api/admin/platform/*
// route maps this file's own errors identically rather than each
// re-deriving its own status codes (and risking one route leaking a 500
// for something another route correctly maps to a 400/404/409).
// ---------------------------------------------------------------------------

export function mapPlatformAdminError(error: unknown): { status: number; message: string } {
  if (
    error instanceof InvalidPersonaError ||
    error instanceof InvalidFeatureIdError ||
    error instanceof SelfLockoutConfirmationRequiredError
  ) {
    return { status: 400, message: error.message };
  }

  if (error instanceof UserNotFoundError || error instanceof OverrideNotFoundError) {
    return { status: 404, message: error.message };
  }

  if (error instanceof LastAdminError) {
    return { status: 409, message: error.message };
  }

  console.error(`${LOG_PREFIX} Unexpected admin action failure`, error);
  return { status: 422, message: error instanceof Error ? error.message : "Action failed." };
}

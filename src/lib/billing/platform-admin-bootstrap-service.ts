import { timingSafeEqual } from "node:crypto";

import * as auditService from "../saas/audit-service";
import { supabaseAdmin } from "../supabase/admin";

import { PlatformRole } from "./platform-schema";
import { isAdmin, resolvePlatformRoles, setPlatformRoles } from "./persona-service";

// Phase 18 Milestone 4, Step 3/4/5 — establishes the FIRST ADMIN.
//
// Audit finding this exists to fix: no user in this system has ever
// held the ADMIN persona (Phase 18 M1-M3 all confirmed this), and
// app_metadata.platform_roles can only be written server-side via the
// Supabase Admin API (persona-service.ts's own header comment) — so
// there was previously no way for anyone to become the first admin at
// all without direct database access. No existing deployment/bootstrap/
// seed script exists in this repo (checked: no scripts/ directory, no
// package.json script beyond dev/build/start/lint/test) — this is a
// new, narrowly-scoped mechanism, not a duplicate of one that already
// existed.
//
// Design, and why:
//   - Gated by PLATFORM_ADMIN_BOOTSTRAP_SECRET, a server-only env var
//     (never NEXT_PUBLIC_-prefixed, so it can never reach a client
//     bundle) — the same plain process.env.X convention this repo
//     already uses for STRIPE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY etc.
//     (.env.local has no schema/validation layer to plug into; this
//     matches what's actually there rather than inventing a new
//     pattern). Compared with a constant-time comparison so the
//     response timing can't be used to guess the secret one byte at a
//     time.
//   - The promoted user is ALWAYS the caller's own authenticated
//     session (userId is passed in by the route after resolving the
//     caller's real Supabase session — never a client-supplied
//     targetUserId). This is the key structural constraint: knowing the
//     secret alone is not enough (you must also already be a real,
//     signed-in, specific user), and being signed in alone is not
//     enough (you must also know the secret) — and even a caller who
//     has both can only ever promote THEMSELVES, never an arbitrary
//     third party. That directly satisfies "never accept userId from an
//     unauthenticated request" AND Step 5's "must not become a general
//     role-assignment API" — it cannot structurally be used to assign
//     roles to anyone but the caller, so it can't be repurposed as one.
//   - Idempotent: a caller who already has ADMIN gets back a safe
//     already-admin result, never a duplicate grant/error.
//   - Every successful grant is written to the EXISTING audit_logs
//     table (auditService.record(), the same mechanism Phase 18 M3
//     uses for role/override changes) — no second audit system, no new
//     table. That log is also reused as the "has bootstrap ever run"
//     signal (see hasAnyBootstrapGrant() below) instead of adding a new
//     persisted marker/table, per Step 5's explicit preference to reuse
//     an existing mechanism first.
//   - Not hard-disabled after one success: Step 5 says "if possible"
//     make it one-time, but a hard code-level lock creates its own
//     lockout-recovery problem (e.g. the first bootstrapped account is
//     lost) with no safe way back in short of direct DB access — which
//     is what this feature exists to avoid needing. The PRIMARY
//     off-switch is operational and already the safest option available:
//     removing PLATFORM_ADMIN_BOOTSTRAP_SECRET from the deployment
//     config makes bootstrapPlatformAdmin() fail closed for everyone,
//     no code change required. Every invocation still requires BOTH
//     factors above regardless of how many admins already exist, so
//     repeat use is never less safe than the first use — it just can't
//     ever target anyone but the caller.

export class BootstrapNotConfiguredError extends Error {
  constructor() {
    super("Admin bootstrap is not configured on this server.");
    this.name = "BootstrapNotConfiguredError";
  }
}

export class BootstrapSecretInvalidError extends Error {
  constructor() {
    super("Invalid bootstrap credential.");
    this.name = "BootstrapSecretInvalidError";
  }
}

export class BootstrapUserNotFoundError extends Error {
  constructor() {
    super("No user exists with that id.");
    this.name = "BootstrapUserNotFoundError";
  }
}

export interface BootstrapResult {
  userId: string;
  roles: PlatformRole[];
  alreadyAdmin: boolean;
}

function timingSafeCompare(presented: string, configured: string): boolean {
  const presentedBuf = Buffer.from(presented);
  const configuredBuf = Buffer.from(configured);

  // Length mismatch is compared as unequal-length buffers rather than
  // returning early on presentedBuf.length !== configuredBuf.length —
  // timingSafeEqual throws on unequal lengths, so a fixed-size dummy
  // comparison runs first for any wrong-length input, keeping wrong-
  // length attempts from returning meaningfully faster than a
  // right-length wrong-value attempt.
  if (presentedBuf.length !== configuredBuf.length) {
    timingSafeEqual(configuredBuf, configuredBuf);
    return false;
  }

  return timingSafeEqual(presentedBuf, configuredBuf);
}

const BOOTSTRAP_AUDIT_ACTION = "platform.bootstrap.admin_granted";

/**
 * Whether any bootstrap grant has ever succeeded — informational only
 * (surfaced in the response so an operator invoking bootstrap again can
 * tell it's not the first grant), never used to block a request. Reuses
 * audit_logs (Phase 14) rather than a new table/column, per Step 5.
 */
async function hasAnyBootstrapGrant(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select("id")
      .eq("action", BOOTSTRAP_AUDIT_ACTION)
      .limit(1);

    if (error) {
      console.error("[billing:bootstrap] Prior-grant lookup failed, treating as unknown", error);
      return false;
    }

    return (data?.length ?? 0) > 0;
  } catch (error) {
    console.error("[billing:bootstrap] Prior-grant lookup threw, treating as unknown", error);
    return false;
  }
}

export async function bootstrapPlatformAdmin(req: Request, callerUserId: string, presentedSecret: string | null): Promise<BootstrapResult> {
  const configuredSecret = process.env.PLATFORM_ADMIN_BOOTSTRAP_SECRET;

  if (!configuredSecret) {
    throw new BootstrapNotConfiguredError();
  }

  if (!presentedSecret || !timingSafeCompare(presentedSecret, configuredSecret)) {
    throw new BootstrapSecretInvalidError();
  }

  // Defense in depth — callerUserId is always resolved server-side from
  // a verified Supabase session before this function is called
  // (never client input), so this should always succeed. Confirms the
  // account still exists rather than assuming the session is current.
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(callerUserId);

  if (error || !data?.user) {
    throw new BootstrapUserNotFoundError();
  }

  const currentRoles = await resolvePlatformRoles(callerUserId);

  if (isAdmin(currentRoles)) {
    return { userId: callerUserId, roles: currentRoles, alreadyAdmin: true };
  }

  // Preserves every existing role (JOB_SEEKER/RECRUITER) — additive
  // only, never a replacement of the roles array.
  const updatedRoles = [...currentRoles, "ADMIN" as const];
  await setPlatformRoles(callerUserId, updatedRoles);

  await auditService.record(req, {
    action: BOOTSTRAP_AUDIT_ACTION,
    objectType: "platform_user",
    objectId: callerUserId,
    organizationId: null,
    userId: callerUserId,
  });

  return { userId: callerUserId, roles: updatedRoles, alreadyAdmin: false };
}

export { hasAnyBootstrapGrant };

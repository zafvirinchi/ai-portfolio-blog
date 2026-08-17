import { createSupabaseServerClient } from "../supabase-server";
import { supabaseAdmin } from "../supabase/admin";

import { PLATFORM_ROLES, PlatformRole } from "./platform-schema";

const LOG_PREFIX = "[billing:persona]";

// Phase 18 Milestone 1 — roles live in Supabase Auth's own app_metadata
// (auth.users.raw_app_meta_data), not a new table. This is the
// Supabase-documented place for exactly this: unlike user_metadata
// (editable by the user themselves via the client SDK's updateUser()),
// app_metadata can ONLY be written through the service-role Admin API
// (supabaseAdmin.auth.admin.updateUserById), so "roles are server-
// derived, never client-writable" (Step 2) is a structural guarantee,
// not a convention this code has to enforce by hand. No new table, no
// migration needed for this piece — reuses Supabase's own existing
// per-user storage the same way src/lib/saas/team-service.ts and
// src/lib/analytics/user-analytics.ts already read auth.users via
// supabaseAdmin.auth.admin.getUserById()/listUsers().

const APP_METADATA_ROLES_KEY = "platform_roles";

function parseRoles(raw: unknown): PlatformRole[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is PlatformRole => typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value));
}

/**
 * Every user is at least JOB_SEEKER by default — the safe, permission-
 * less starting persona (never RECRUITER or ADMIN, both of which must
 * be explicitly granted). Falls back to the same default on any lookup
 * failure (e.g. an invalid/deleted userId) rather than throwing, since
 * a persona lookup failing should degrade to "least privilege", never
 * block or crash an unrelated request.
 */
export async function resolvePlatformRoles(userId: string): Promise<PlatformRole[]> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (error || !data?.user) {
    if (error) console.error(`${LOG_PREFIX} Role lookup failed, defaulting to JOB_SEEKER`, error);
    return ["JOB_SEEKER"];
  }

  const roles = parseRoles(data.user.app_metadata?.[APP_METADATA_ROLES_KEY]);
  return roles.length > 0 ? roles : ["JOB_SEEKER"];
}

export function isAdmin(roles: PlatformRole[]): boolean {
  return roles.includes("ADMIN");
}

export function isRecruiter(roles: PlatformRole[]): boolean {
  return roles.includes("RECRUITER");
}

/**
 * Grants/revokes are additive-only here (no removal helper yet — not
 * needed until an admin UI exists, Phase 18 M2+) and always require the
 * CALLER to already be resolved as ADMIN — enforced by every caller of
 * this function (entitlement-service.ts), never by this function
 * itself, since it has no way to know who's asking without threading a
 * second userId through every call. Never exposed to a client-facing
 * route in this milestone.
 */
export async function setPlatformRoles(userId: string, roles: PlatformRole[]): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: { [APP_METADATA_ROLES_KEY]: roles },
  });

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Roles Updated`, { userId, roles });
}

/**
 * The one place this milestone resolves "who is making this request,
 * if anyone" without requiring one (mirrors resume-version-auth.ts's
 * requireUserId(), minus the throw) — every representative integration
 * (Step 16) and every future route wiring requireFeature()/requireQuota()
 * uses this so an anonymous request is never blocked: no user resolves,
 * the caller's own no-op-when-anonymous branch takes over, identical to
 * credit-service.ts's checkCredits()/consumeCredits() precedent.
 */
export async function getOptionalUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

/**
 * Phase 18 Milestone 2 — a REQUIRED variant for routes that genuinely
 * need a signed-in user, with a message appropriate to this package.
 * Deliberately NOT reusing resume-versions/resume-version-auth.ts's own
 * UnauthorizedError here — that class's message is hardcoded to
 * resume-version wording ("...to manage resume versions"), which
 * live-probing this milestone's own routes surfaced as genuinely
 * misleading in a billing context. A distinct error class per package
 * with its own accurate message, both mapped to the same 401, is the
 * correct fix — not a shared class with the wrong words.
 *
 * Phase 18 Milestone 3 — the message below was originally "...to manage
 * your billing", written when this class was only used by the checkout/
 * portal/overview routes. Now that requirePlatformAdmin() (this file)
 * also throws it for every /admin/platform/* route on the "no session
 * at all" path, live-probing surfaced the SAME class of context
 * mismatch again — "manage your billing" makes no sense for "search
 * users". Generalized to cover both truthfully, rather than forking a
 * second near-identical error class per sub-area.
 */
export class PlatformUnauthorizedError extends Error {
  constructor() {
    super("You must be signed in to access this.");
    this.name = "PlatformUnauthorizedError";
  }
}

export async function requireUserId(): Promise<{ userId: string; email: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new PlatformUnauthorizedError();
  }

  return { userId: user.id, email: user.email ?? null };
}

/**
 * Phase 18 Milestone 3 — thrown when a real, authenticated session
 * exists but doesn't resolve as ADMIN. Kept distinct from
 * PlatformUnauthorizedError (401 — no session at all) so every admin
 * route can map the two to the correct 401 vs 403 (Step: "return safe
 * 401/403 responses without leaking protected data").
 */
export class AdminAccessRequiredError extends Error {
  constructor() {
    super("This action requires administrator access.");
    this.name = "AdminAccessRequiredError";
  }
}

/**
 * THE one place every admin-only platform route in this milestone
 * resolves "is this a real admin, and who are they" — never trusts a
 * client-supplied userId as proof of anything (Security requirement):
 * the acting user is always the real Supabase session
 * (requireUserId()), and their ADMIN status is always re-derived from
 * app_metadata via resolvePlatformRoles() on every call, never cached,
 * never accepted as a client claim.
 */
export async function requirePlatformAdmin(): Promise<{ userId: string; email: string | null }> {
  const { userId, email } = await requireUserId();
  const roles = await resolvePlatformRoles(userId);

  if (!isAdmin(roles)) {
    throw new AdminAccessRequiredError();
  }

  return { userId, email };
}

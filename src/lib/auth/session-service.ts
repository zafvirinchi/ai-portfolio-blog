import { supabaseAdmin } from "../supabase/admin";

import { AuthSession } from "./auth-types";

const LOG_PREFIX = "[auth]";

// Supabase's own session store isn't queryable via supabase-js, so
// this table is our own lightweight record — one row per login — for
// the Active Sessions UI. The AUTH_SESSION_COOKIE_NAME cookie (set by
// auth-service.ts at login, same convention as saas/tenant-context.ts's
// active_org_id) points at which row is "this device," since we never
// store the real Supabase refresh token here.
export const AUTH_SESSION_COOKIE_NAME = "auth_session_id";

const TOUCH_STALE_MS = 5 * 60 * 1000;

/**
 * Records a new "Active Sessions" bookkeeping row for this login — never
 * the real Supabase authentication itself (that has already succeeded,
 * via Supabase's own httpOnly session cookies, before finalizeLogin()
 * ever calls this). Fails OPEN (logs, returns null) rather than
 * throwing, matching this same file's own touch()/list() siblings and
 * security-service.ts's detectSuspiciousLogin()/audit-auth.ts's
 * record() in the exact same call chain — this was the one outlier in
 * that chain that instead threw and crashed the entire login (both
 * password and OAuth) whenever auth_sessions doesn't exist yet
 * (confirmed, live: Phase 22's own audits found this table genuinely
 * unmigrated). A logging/bookkeeping failure must never break the
 * feature it's observing (CLAUDE.md's own stated asymmetry) — losing
 * this one login's entry in the Active Sessions list is an acceptable,
 * purely cosmetic degradation; losing the ability to log in at all is
 * not.
 */
export async function record(userId: string, ipAddress: string | null, userAgent: string | null): Promise<AuthSession | null> {
  const { data, error } = await supabaseAdmin
    .from("auth_sessions")
    .insert({ user_id: userId, ip_address: ipAddress, user_agent: userAgent })
    .select()
    .single();

  if (error) {
    console.error(`${LOG_PREFIX} Session record failed, continuing login without active-session tracking`, error);
    return null;
  }

  return { ...data, is_current: true } as AuthSession;
}

/** Cheap — only writes when the row is more than 5 minutes stale, so this is safe to call on every request from middleware.ts. */
export async function touch(sessionId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin.from("auth_sessions").select("last_seen_at, revoked_at").eq("id", sessionId).maybeSingle();

    if (!data || data.revoked_at) return;

    if (Date.now() - new Date(data.last_seen_at).getTime() < TOUCH_STALE_MS) {
      return;
    }

    await supabaseAdmin.from("auth_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", sessionId);
  } catch (error) {
    console.error(`${LOG_PREFIX} Session touch failed`, error);
  }
}

/** Fails OPEN (logs, returns an empty list) rather than throwing — the Active Sessions UI degrading to "no sessions to show" is preferable to breaking the settings page entirely over this bookkeeping table. */
export async function list(userId: string, currentSessionId: string | null): Promise<AuthSession[]> {
  const { data, error } = await supabaseAdmin
    .from("auth_sessions")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });

  if (error) {
    console.error(`${LOG_PREFIX} Session list failed, returning empty`, error);
    return [];
  }

  return (data ?? []).map((row) => ({ ...row, is_current: row.id === currentSessionId }) as AuthSession);
}

/**
 * Marks every other session revoked in our own bookkeeping table. The
 * real Supabase-level revocation is done separately via
 * auth.signOut({scope: "others"}) — see auth-service.ts logout() and
 * the password-change route, both of which call the real Supabase
 * revocation BEFORE this. Fails OPEN (logs, returns) rather than
 * throwing: a failure here means only our own bookkeeping table is out
 * of sync, never that the real session survived — Supabase's own
 * signOut() already ended it.
 */
export async function revokeOthers(userId: string, currentSessionId: string | null): Promise<void> {
  let query = supabaseAdmin.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);

  if (currentSessionId) {
    query = query.neq("id", currentSessionId);
  }

  const { error } = await query;

  if (error) {
    console.error(`${LOG_PREFIX} Session revoke-others bookkeeping failed (real Supabase revocation is unaffected)`, error);
  }
}

/** Same reasoning as revokeOthers() above — bookkeeping only, fails open. */
export async function revoke(sessionId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", sessionId);

  if (error) {
    console.error(`${LOG_PREFIX} Session revoke bookkeeping failed`, error);
  }
}

/** Absolute + idle timeout check — 30 days absolute, 7 days idle by default. */
export function isSessionExpired(session: Pick<AuthSession, "created_at" | "last_seen_at" | "revoked_at">): boolean {
  if (session.revoked_at) return true;

  const ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;
  const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

  const now = Date.now();
  const createdAt = new Date(session.created_at).getTime();
  const lastSeenAt = new Date(session.last_seen_at).getTime();

  return now - createdAt > ABSOLUTE_TIMEOUT_MS || now - lastSeenAt > IDLE_TIMEOUT_MS;
}

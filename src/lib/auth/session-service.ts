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

export async function record(userId: string, ipAddress: string | null, userAgent: string | null): Promise<AuthSession> {
  const { data, error } = await supabaseAdmin
    .from("auth_sessions")
    .insert({ user_id: userId, ip_address: ipAddress, user_agent: userAgent })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
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

export async function list(userId: string, currentSessionId: string | null): Promise<AuthSession[]> {
  const { data, error } = await supabaseAdmin
    .from("auth_sessions")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({ ...row, is_current: row.id === currentSessionId }) as AuthSession);
}

/** Marks every other session revoked in our own bookkeeping table. The real Supabase-level revocation is done separately via auth.signOut({scope: "others"}) — see auth-service.ts logout(). */
export async function revokeOthers(userId: string, currentSessionId: string | null): Promise<void> {
  let query = supabaseAdmin.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);

  if (currentSessionId) {
    query = query.neq("id", currentSessionId);
  }

  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }
}

export async function revoke(sessionId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", sessionId);

  if (error) {
    throw new Error(error.message);
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

import { supabaseAdmin } from "../supabase/admin";

import { LOCKOUT_POLICY, SecurityEventType } from "./auth-schema";

const LOG_PREFIX = "[auth]";

/** Same header-extraction pattern as src/lib/saas/audit-service.ts, reused here. */
export function extractIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

export function extractUserAgent(req: Request): string | null {
  return req.headers.get("user-agent");
}

/** CSRF — Origin/Referer must match the request's own Host, combined with the existing SameSite=Lax cookie convention. */
export function verifySameOrigin(req: Request): boolean {
  const host = req.headers.get("host");
  if (!host) return false;

  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return true; // same-origin fetches from same-site pages may omit Origin; SameSite=Lax already blocks cross-site cookie sends

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export interface LockoutStatus {
  locked: boolean;
  failedAttempts: number;
  limit: number;
}

/** Read-only — counts recent failed login_attempt rows for this email. Does not record anything itself. */
export async function checkLoginLockout(email: string): Promise<LockoutStatus> {
  const since = new Date(Date.now() - LOCKOUT_POLICY.loginWindowMinutes * 60 * 1000).toISOString();

  const { count, error } = await supabaseAdmin
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", "login_attempt")
    .eq("key", email)
    .eq("success", false)
    .gte("created_at", since);

  if (error) {
    throw new Error(error.message);
  }

  const failedAttempts = count ?? 0;

  return { locked: failedAttempts >= LOCKOUT_POLICY.maxFailedLoginAttempts, failedAttempts, limit: LOCKOUT_POLICY.maxFailedLoginAttempts };
}

export async function recordLoginAttempt(email: string, success: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from("security_events").insert({ event_type: "login_attempt", key: email, success });

  if (error) {
    console.error(`${LOG_PREFIX} Failed to record login attempt`, error);
  }
}

export interface RequestLimitResult {
  allowed: boolean;
  usedInWindow: number;
  limit: number;
}

/** Reserve-before-work, same shape as src/lib/ai/job-match/rate-limiter.ts's checkAndRecordUsage — used for requests that have no success/fail outcome of their own (password-reset requests, OTP sends). */
export async function checkAndRecordRequestLimit(
  eventType: Exclude<SecurityEventType, "login_attempt">,
  key: string,
  limit: number,
  windowMinutes: number
): Promise<RequestLimitResult> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { count, error: countError } = await supabaseAdmin
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", eventType)
    .eq("key", key)
    .gte("created_at", since);

  if (countError) {
    throw new Error(countError.message);
  }

  const usedInWindow = count ?? 0;

  if (usedInWindow >= limit) {
    return { allowed: false, usedInWindow, limit };
  }

  const { error: insertError } = await supabaseAdmin.from("security_events").insert({ event_type: eventType, key, success: true });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return { allowed: true, usedInWindow: usedInWindow + 1, limit };
}

/** Heuristic — flags a login from an IP or user-agent never seen before for this user, based on their own auth_sessions history. Never throws; a failure here should never block a real login. */
export async function detectSuspiciousLogin(userId: string, ipAddress: string | null, userAgent: string | null): Promise<void> {
  try {
    const { data: priorSessions } = await supabaseAdmin
      .from("auth_sessions")
      .select("ip_address, user_agent")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!priorSessions || priorSessions.length === 0) {
      return; // first-ever login — nothing to compare against
    }

    const seenIps = new Set(priorSessions.map((row) => row.ip_address).filter(Boolean));
    const seenAgents = new Set(priorSessions.map((row) => row.user_agent).filter(Boolean));

    const newIp = ipAddress && !seenIps.has(ipAddress);
    const newAgent = userAgent && !seenAgents.has(userAgent);

    if (!newIp && !newAgent) return;

    await supabaseAdmin.from("security_alerts").insert({
      user_id: userId,
      alert_type: newIp ? "new_location_ip" : "new_device",
      description: newIp
        ? `Login from a new IP address (${ipAddress})`
        : `Login from a new device/browser (${userAgent?.slice(0, 120) ?? "unknown"})`,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Suspicious login detection failed`, error);
  }
}

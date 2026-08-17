import { supabaseAdmin } from "@/lib/supabase/admin";

// Phase 21 Milestone 2 — generalizes the existing per-IP daily rate
// limiter pattern (src/lib/ai/job-match/rate-limiter.ts) to protect
// /api/ai/chat and /api/ai/resume, the two anonymous, multi-LLM-call
// routes Phase 21 Milestone 1 found had zero cost control (§13 Finding
// 3 / §8). Deliberately NOT a reuse of job_match_requests itself — see
// this migration's own header comment (20260818000000_add_anonymous_ai_
// rate_limits.sql) for why that table can't safely be repurposed for a
// different feature. Everything else about the mechanism — storage
// (Supabase table), key derivation (X-Forwarded-For, first entry),
// rolling 24h window, reserve-before-work (a rejected/failed attempt
// still counts), fail-closed on a DB error — is an intentional, exact
// port of the proven job-match pattern, not a new design.
//
// Deliberately scoped to ANONYMOUS callers only: an authenticated
// platform user is governed exclusively by the existing Phase 18/19
// entitlement/quota system (src/lib/billing/entitlement-service.ts) —
// this module is never consulted for a request with a resolved session,
// so it can never interact with or double-count against that system.

export type AnonymousAiFeature = "ai_chat" | "resume_analyze";

// Provisional, deliberately generous per-IP daily caps — a cost-abuse
// floor, not a monetization decision (no plan/pricing is defined or
// implied here). resume_analyze mirrors job-match's own established
// 3/day precedent exactly (a comparable multi-OpenAI-call-per-submission
// profile — see resume-service.ts's own "several OpenAI calls" comment).
// ai_chat is set higher because a single chat message is a lighter,
// conversational ask individually, even though it can internally fan out
// up to ~6 LLM calls via the multi-agent coordinator — 15/day still
// bounds the previously-unbounded worst case to at most ~90 LLM
// calls/day/IP, versus literally no ceiling before this milestone.
const FEATURE_LIMITS: Record<AnonymousAiFeature, number> = {
  ai_chat: 15,
  resume_analyze: 3,
};

const WINDOW_MS = 24 * 60 * 60 * 1000;
const TABLE = "anonymous_ai_requests";

export interface AnonymousRateLimitResult {
  allowed: boolean;
  usedToday: number;
  limit: number;
  /** Seconds until the oldest request in the current window ages out — undefined if it couldn't be determined (best-effort only, never blocks the allow/deny decision itself). */
  retryAfterSeconds?: number;
}

/**
 * True specifically for "the anonymous_ai_requests table doesn't exist
 * yet" (PostgREST code PGRST205, or Postgres 42P01) — the expected state
 * in any environment where 20260818000000_add_anonymous_ai_rate_limits.sql
 * hasn't been applied yet (this repo's own established, migration-tooling-
 * free convention: manual SQL Editor application, never assumed to have
 * run — see plan-service.ts's getPlanByKey()/getActiveSubscription() for
 * the same idiom applied elsewhere). Deliberately distinguished from
 * every OTHER kind of Supabase error (connection refused, timeout,
 * permission denied), which still fails closed below.
 */
function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01" || (error.message?.toLowerCase().includes("could not find the table") ?? false);
}

/**
 * Checks how many requests this IP has already made for this feature
 * today and, if under the limit, immediately records this attempt
 * (reserve-before-work) so repeated failed/abusive attempts still count
 * against the cap — not just successful ones.
 *
 * Fails CLOSED (throws) on a genuine Supabase error, same as
 * job-match/rate-limiter.ts: this function exists specifically to bound
 * uncontrolled cost, so silently allowing every request through during a
 * real DB outage would defeat its entire purpose.
 *
 * The ONE deliberate exception — fails OPEN (allows, does not throw) —
 * is the migration genuinely not having been applied yet
 * (isMissingTableError() above). This is NOT the same situation
 * job-match/rate-limiter.ts's identical-looking fail-closed behavior
 * protects against: an un-migrated environment is an expected, common
 * startup state in this repo (no migration tooling, every migration is
 * manually applied — CLAUDE.md's own documented convention), not an
 * abuse signal or an outage. Failing closed here would mean this
 * milestone's fix, before its migration is manually run, makes
 * /api/ai/chat and /api/ai/resume hard-fail for every anonymous caller —
 * strictly WORSE than the pre-fix state (unprotected but working), and a
 * direct violation of this milestone's explicit "do NOT break anonymous
 * functionality unnecessarily" instruction. Logged loudly (console.error)
 * either way so this is visible in production logs, not silent.
 *
 * Not atomic under true concurrent requests from the same IP (a plain
 * check-then-insert, no DB constraint) — see the module's own test file
 * for a demonstrated, documented account of why this is judged
 * acceptable for this milestone.
 */
export async function checkAndRecordAnonymousUsage(feature: AnonymousAiFeature, ipAddress: string): Promise<AnonymousRateLimitResult> {
  const limit = FEATURE_LIMITS[feature];
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count, error: countError } = await supabaseAdmin
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("feature", feature)
    .eq("ip_address", ipAddress)
    .gte("created_at", since);

  if (countError) {
    if (isMissingTableError(countError)) {
      console.error(
        `Anonymous AI rate limit table not found — allowing this request. OPERATIONAL BLOCKER: run 20260818000000_add_anonymous_ai_rate_limits.sql in the Supabase SQL Editor to enable anonymous cost protection for "${feature}".`
      );
      return { allowed: true, usedToday: 0, limit };
    }

    throw new Error(`Anonymous AI rate limit check failed: ${countError.message}`);
  }

  const usedToday = count ?? 0;

  if (usedToday >= limit) {
    const retryAfterSeconds = await estimateRetryAfterSeconds(feature, ipAddress, since);
    return { allowed: false, usedToday, limit, retryAfterSeconds };
  }

  const { error: insertError } = await supabaseAdmin.from(TABLE).insert({ feature, ip_address: ipAddress });

  if (insertError) {
    if (isMissingTableError(insertError)) {
      console.error(
        `Anonymous AI rate limit table not found — allowing this request. OPERATIONAL BLOCKER: run 20260818000000_add_anonymous_ai_rate_limits.sql in the Supabase SQL Editor to enable anonymous cost protection for "${feature}".`
      );
      return { allowed: true, usedToday: usedToday + 1, limit };
    }

    throw new Error(`Anonymous AI rate limit recording failed: ${insertError.message}`);
  }

  return { allowed: true, usedToday: usedToday + 1, limit };
}

/** Best-effort only — a failure here never changes the allow/deny decision, it only means the response omits a retry hint. */
async function estimateRetryAfterSeconds(feature: AnonymousAiFeature, ipAddress: string, since: string): Promise<number | undefined> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("created_at")
    .eq("feature", feature)
    .eq("ip_address", ipAddress)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return undefined;

  const oldest = new Date(data[0].created_at as string).getTime();
  const resetAt = oldest + WINDOW_MS;
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}

/** Extracts the client IP from a request the same way Vercel's platform forwards it — identical to job-match/rate-limiter.ts's getClientIp(). */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

import { supabaseAdmin } from "@/lib/supabase/admin";

// Public feature, calls OpenAI twice per submission, no auth/paywall yet —
// this is the only thing standing between an open route and an unbounded
// OpenAI bill. Deliberately generous for a free tier; tighten once
// monetization exists. Requires supabase/migrations/
// 20260803000000_add_job_match_rate_limit.sql to have been run.
const DAILY_LIMIT = 3;
const TABLE = "job_match_requests";

export interface RateLimitResult {
  allowed: boolean;
  usedToday: number;
  limit: number;
}

/**
 * Checks how many analyses this IP has already run today and, if under the
 * limit, immediately records this attempt (reserve-before-work) so repeated
 * failed/abusive attempts still count against the cap — not just successful
 * ones.
 */
export async function checkAndRecordUsage(ipAddress: string): Promise<RateLimitResult> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error: countError } = await supabaseAdmin
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ipAddress)
    .gte("created_at", since);

  if (countError) {
    throw new Error(`Rate limit check failed: ${countError.message}`);
  }

  const usedToday = count ?? 0;

  if (usedToday >= DAILY_LIMIT) {
    return { allowed: false, usedToday, limit: DAILY_LIMIT };
  }

  const { error: insertError } = await supabaseAdmin.from(TABLE).insert({ ip_address: ipAddress });

  if (insertError) {
    throw new Error(`Rate limit recording failed: ${insertError.message}`);
  }

  return { allowed: true, usedToday: usedToday + 1, limit: DAILY_LIMIT };
}

/** Extracts the client IP from a request the same way Vercel's platform forwards it. */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

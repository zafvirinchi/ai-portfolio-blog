// Phase 18 Milestone 7, Step 10 — client-safe (no server-only imports:
// no supabase-server, no supabaseAdmin) counterpart to entitlement-
// response.ts's EntitlementErrorBody. Every feature page that calls a
// requireFeature()/requireQuota()-gated route (Phase 18 M5) already
// receives this shape in a 402/401 JSON body but, until this milestone,
// discarded everything except `.error` — losing `code`/`limit`/`used`/
// `period` and rendering a plain, actionless error string instead of
// UpgradePrompt. This is the one place that shape is read back out on
// the client, reused by every component below rather than each
// re-implementing its own ad hoc parsing.

export type EntitlementErrorCode = "AUTH_REQUIRED" | "FEATURE_NOT_INCLUDED" | "QUOTA_EXCEEDED";

// Phase 19 Milestone 4, Step 2/3/6 — shared by UpgradePrompt (a rejected
// QUOTA_EXCEEDED action) AND /settings/billing (a usage row nearing/at
// its limit): no server field carries a reset DATE (usage-event-
// service.ts's periodStartIso() computes a period START on the fly per
// query, never persists or returns an end date), so nothing is
// fabricated here — this mirrors that SAME UTC boundary logic (DAY ->
// next UTC midnight, MONTH -> the 1st of next UTC month, LIFETIME ->
// never resets) purely for display, using only a period string already
// present on the server response. If usage-event-service.ts's boundary
// logic ever changes, this must change with it.
export function describeResetDate(period: string | null | undefined): string | null {
  if (period !== "DAY" && period !== "MONTH") return null;

  const now = new Date();
  const resetsAt =
    period === "DAY"
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const formatted = resetsAt.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(period === "DAY" ? {} : { year: "numeric" }) });
  return period === "DAY" ? `Resets at midnight UTC (${formatted})` : `Resets ${formatted}`;
}

export interface EntitlementErrorInfo {
  code: EntitlementErrorCode;
  message: string;
  limit: number | null;
  used: number | null;
  period: string | null;
  /** Present only for FEATURE_NOT_INCLUDED — lets UpgradePrompt answer "what plan unlocks it?" (Phase 19 M1, Step 7) via platform-plan-registry.ts's findCheapestPlanGranting(). */
  featureId: string | null;
}

// Phase 19 Milestone 4, Step 5 — for the handful of callers whose own
// action handler already throws a plain Error across a component
// boundary (e.g. RecruiterWorkspacePage's handleBulkStatusChange ->
// RecruiterCandidateTable's catch block) rather than reading the JSON
// body directly: this carries the SAME EntitlementErrorInfo already
// read via readEntitlementError() through that throw/catch boundary
// instead of collapsing it to a string, so the ultimate catcher can
// still render UpgradePrompt.
export class EntitlementAwareError extends Error {
  constructor(public readonly info: EntitlementErrorInfo) {
    super(info.message);
    this.name = "EntitlementAwareError";
  }
}

/** Returns null for any body that isn't this shape (a plain `{ error }` string, a network failure, a non-entitlement 4xx/5xx) — callers fall back to their existing generic error display for everything else. */
export function readEntitlementError(body: unknown, fallbackMessage: string): EntitlementErrorInfo | null {
  if (!body || typeof body !== "object") return null;

  const record = body as Record<string, unknown>;
  const code = record.code;

  if (code !== "AUTH_REQUIRED" && code !== "FEATURE_NOT_INCLUDED" && code !== "QUOTA_EXCEEDED") return null;

  return {
    code,
    message: typeof record.error === "string" ? record.error : fallbackMessage,
    limit: typeof record.limit === "number" ? record.limit : null,
    used: typeof record.used === "number" ? record.used : null,
    period: typeof record.period === "string" ? record.period : null,
    featureId: typeof record.featureId === "string" ? record.featureId : null,
  };
}

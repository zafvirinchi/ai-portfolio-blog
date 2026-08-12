// Phase 13 Milestone 20, Part 3/4 — traffic-audit instrumentation for the
// legacy /api/ai/resume/versions/[id]/optimize route (see
// PHASE13_MILESTONE20_RESUME_OPTIMIZER_SECURITY_AND_LEGACY_ROUTE_AUDIT.md).
// Extracted into its own pure module (rather than inlined in the route)
// specifically so the exact log payload shape — and the guarantee that it
// never contains resume/JD/user content — is independently unit-testable
// without spinning up the route handler itself, matching this codebase's
// existing "pure builder consumed by a thin route" convention.

// Phase 13 Milestone 21, Part 3 — added an `event` field to both existing
// payloads (cheap, additive, zero control-flow change) and a new
// "completed" log fired only on the guaranteed-success path, so a
// successful, fully-completed request is distinguishable from a mere
// probe/authentication attempt. Deliberately did NOT add a matching
// "failed" event: doing so would require restructuring the route's
// existing per-error-type catch block (computing a duplicate status-code
// mapping) purely for telemetry — a disproportionate risk for an
// audit-only milestone that must preserve the route's existing,
// already-correct error-handling behavior unchanged. A failed/rejected
// request is still visible via the "accessed" log alone (the absence of
// a following "authenticated"/"completed" line for that same window is
// the signal); see this milestone's doc for the full reasoning.

export const LEGACY_OPTIMIZE_ROUTE_NAME = "/api/ai/resume/versions/[id]/optimize";

export interface AuditLogEntry {
  message: string;
  payload: Record<string, unknown>;
}

/** Fired unconditionally, before authentication/body-parsing — the only way to see an unauthenticated or malformed hit at all. */
export function buildLegacyOptimizeAccessedLog(): AuditLogEntry {
  return {
    message: "[resume-optimizer-audit] Legacy optimize route accessed",
    payload: { route: LEGACY_OPTIMIZE_ROUTE_NAME, event: "accessed", timestamp: new Date().toISOString() },
  };
}

/** Fired only once requireUserId() has already resolved successfully — never includes the resolved userId itself, just the boolean fact of authentication. */
export function buildLegacyOptimizeAuthenticatedLog(): AuditLogEntry {
  return {
    message: "[resume-optimizer-audit] Legacy optimize route request authenticated",
    payload: { route: LEGACY_OPTIMIZE_ROUTE_NAME, event: "authenticated", authenticated: true },
  };
}

/** Fired only once the legacy optimization has fully completed and is about to be returned — never includes the version/resume/JD content, only how long the operation took. */
export function buildLegacyOptimizeCompletedLog(durationMs: number): AuditLogEntry {
  return {
    message: "[resume-optimizer-audit] Legacy optimize route request completed",
    payload: { route: LEGACY_OPTIMIZE_ROUTE_NAME, event: "completed", success: true, durationMs },
  };
}

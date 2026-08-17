import { NextResponse } from "next/server";

import { FeatureNotEntitledError, QuotaExceededError } from "./entitlement-service";
import { PlatformUnauthorizedError } from "./persona-service";

// Phase 18 Milestone 5, Step 5 — before this file, every route that
// wired requireFeature()/requireQuota() (2 routes, M1's own
// "representative integration") mapped FeatureNotEntitledError/
// QuotaExceededError to a bare `{ error: string }` at 402, same as
// InsufficientCreditsError — indistinguishable from each other or from
// a generic failure without parsing the message string. Every route
// this milestone newly wires (many more than 2) needs a SHARED, typed
// shape so the client can tell FEATURE_NOT_INCLUDED apart from
// QUOTA_EXCEEDED apart from AUTH_REQUIRED without string-matching —
// this is that one shape, reused everywhere, never duplicated per
// route. HTTP status codes are unchanged from what routes already used
// (401 for no session, 402 for both entitlement failures, matching
// InsufficientCreditsError's existing convention) — Step 5's "preserve
// existing HTTP semantics wherever possible".

export type EntitlementErrorCode = "AUTH_REQUIRED" | "FEATURE_NOT_INCLUDED" | "QUOTA_EXCEEDED";

export interface EntitlementErrorBody {
  error: string;
  code: EntitlementErrorCode;
  featureId?: string;
  metric?: string;
  limit?: number;
  used?: number;
  period?: string;
}

export interface MappedEntitlementError {
  status: number;
  body: EntitlementErrorBody;
}

/**
 * Returns null for anything that isn't one of the three known
 * entitlement error types — callers fall through to their own generic
 * error handling for everything else. Never touches Stripe errors,
 * internal pricing config, or any value not already present on the
 * typed error objects themselves (featureId/metric/limit/used/period —
 * all safe, application-level facts, never a Stripe id/secret).
 */
export function mapEntitlementError(error: unknown): MappedEntitlementError | null {
  if (error instanceof PlatformUnauthorizedError) {
    return { status: 401, body: { error: error.message, code: "AUTH_REQUIRED" } };
  }

  if (error instanceof FeatureNotEntitledError) {
    return { status: 402, body: { error: error.message, code: "FEATURE_NOT_INCLUDED", featureId: error.featureId } };
  }

  if (error instanceof QuotaExceededError) {
    return {
      status: 402,
      body: { error: error.message, code: "QUOTA_EXCEEDED", metric: error.metric, limit: error.limit, used: error.used, period: error.period },
    };
  }

  return null;
}

export function entitlementErrorResponse(error: unknown): NextResponse | null {
  const mapped = mapEntitlementError(error);
  if (!mapped) return null;
  return NextResponse.json(mapped.body, { status: mapped.status });
}

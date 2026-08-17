import { describe, expect, it, vi } from "vitest";

// entitlement-service.ts is imported for real below (its own
// QuotaExceededError/FeatureNotEntitledError classes, so
// entitlementErrorResponse()'s instanceof checks are tested against
// the exact classes it actually uses) — but it transitively pulls in
// supabase/admin.ts, which constructs a real Supabase client at MODULE
// TOP LEVEL and throws without real env vars (same issue every other
// test touching this dependency chain already works around). Mocked
// here purely so the module graph can load; nothing in this file ever
// calls the mocked client.
vi.mock("../supabase/admin", () => ({ supabaseAdmin: {} }));

import { FeatureNotEntitledError, QuotaExceededError } from "./entitlement-service";
import { PlatformUnauthorizedError } from "./persona-service";
import { entitlementErrorResponse, mapEntitlementError } from "./entitlement-response";

// Phase 18 Milestone 5, Step 5 — the shared entitlement-error contract
// every newly-wired route uses. Uses the REAL error classes (not
// mocks) — these are pure, dependency-free constructors, so there's
// no reason to fake them, unlike persona-service.ts's own network-
// touching functions.

describe("mapEntitlementError", () => {
  it("maps PlatformUnauthorizedError to 401/AUTH_REQUIRED", () => {
    const mapped = mapEntitlementError(new PlatformUnauthorizedError());
    expect(mapped).toEqual({ status: 401, body: { error: "You must be signed in to access this.", code: "AUTH_REQUIRED" } });
  });

  it("maps FeatureNotEntitledError to 402/FEATURE_NOT_INCLUDED, carrying the featureId", () => {
    const mapped = mapEntitlementError(new FeatureNotEntitledError("resume.optimize"));
    expect(mapped?.status).toBe(402);
    expect(mapped?.body.code).toBe("FEATURE_NOT_INCLUDED");
    expect(mapped?.body.featureId).toBe("resume.optimize");
  });

  it("maps QuotaExceededError to 402/QUOTA_EXCEEDED, carrying metric/limit/used/period", () => {
    const mapped = mapEntitlementError(new QuotaExceededError("JD_MATCHES", 5, 5, "MONTH"));
    expect(mapped?.status).toBe(402);
    expect(mapped).toEqual({
      status: 402,
      body: { error: expect.stringContaining("JD_MATCHES"), code: "QUOTA_EXCEEDED", metric: "JD_MATCHES", limit: 5, used: 5, period: "MONTH" },
    });
  });

  it("returns null for any other error — callers fall through to their own generic handling", () => {
    expect(mapEntitlementError(new Error("some unrelated failure"))).toBeNull();
    expect(mapEntitlementError("not even an Error")).toBeNull();
  });

  it("never leaks Stripe ids, internal pricing config, or any field beyond the typed error's own safe properties", () => {
    const mapped = mapEntitlementError(new QuotaExceededError("AI_REWRITES", 30, 30, "MONTH"));
    expect(Object.keys(mapped!.body).sort()).toEqual(["error", "limit", "metric", "period", "used", "code"].sort());
  });
});

describe("entitlementErrorResponse", () => {
  it("produces a NextResponse with the mapped status and JSON body for a known entitlement error", async () => {
    const response = entitlementErrorResponse(new FeatureNotEntitledError("recruiter.analytics"));
    expect(response).not.toBeNull();
    expect(response!.status).toBe(402);
    const body = await response!.json();
    expect(body).toEqual({ error: expect.any(String), code: "FEATURE_NOT_INCLUDED", featureId: "recruiter.analytics" });
  });

  it("returns null (not a Response) for a non-entitlement error, so callers know to keep handling it themselves", () => {
    expect(entitlementErrorResponse(new Error("db exploded"))).toBeNull();
  });
});

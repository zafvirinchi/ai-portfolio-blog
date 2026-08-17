import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeResetDate, EntitlementAwareError, readEntitlementError } from "./entitlement-client-error";

// Phase 18 Milestone 7, Step 10/14 — the client-side counterpart to
// entitlement-response.test.ts. Every feature page wired this milestone
// (JobMatchUpload, JobUpload, JdUpload, ResumeOptimizerPanel,
// MockInterviewSetup, resume-rewriter/interview-preparation pages,
// RecruiterDashboardTab, RecruiterAnalyticsTab) depends on this
// function correctly distinguishing an entitlement rejection from any
// other API failure before deciding whether to render UpgradePrompt.

describe("readEntitlementError", () => {
  it("recognizes FEATURE_NOT_INCLUDED and carries the server's own message and featureId through", () => {
    const result = readEntitlementError({ error: "Not on your plan.", code: "FEATURE_NOT_INCLUDED", featureId: "resume.optimize" }, "fallback");
    expect(result).toEqual({ code: "FEATURE_NOT_INCLUDED", message: "Not on your plan.", limit: null, used: null, period: null, featureId: "resume.optimize" });
  });

  it("recognizes QUOTA_EXCEEDED and carries limit/used/period through (no featureId on this code)", () => {
    const result = readEntitlementError({ error: "Limit reached.", code: "QUOTA_EXCEEDED", metric: "JD_MATCHES", limit: 5, used: 5, period: "MONTH" }, "fallback");
    expect(result).toEqual({ code: "QUOTA_EXCEEDED", message: "Limit reached.", limit: 5, used: 5, period: "MONTH", featureId: null });
  });

  it("recognizes AUTH_REQUIRED", () => {
    const result = readEntitlementError({ error: "Sign in.", code: "AUTH_REQUIRED" }, "fallback");
    expect(result?.code).toBe("AUTH_REQUIRED");
  });

  it("returns null for a plain, non-entitlement error body — every existing error path stays unaffected", () => {
    expect(readEntitlementError({ error: "Something else went wrong" }, "fallback")).toBeNull();
  });

  it("returns null for an unrecognized code value — never guesses at an unknown shape", () => {
    expect(readEntitlementError({ error: "x", code: "SOMETHING_NEW" }, "fallback")).toBeNull();
  });

  it("returns null for non-object bodies (null, a string, a number) without throwing", () => {
    expect(readEntitlementError(null, "fallback")).toBeNull();
    expect(readEntitlementError("plain string", "fallback")).toBeNull();
    expect(readEntitlementError(42, "fallback")).toBeNull();
  });

  it("falls back to the caller-supplied message when the body has no usable .error string", () => {
    const result = readEntitlementError({ code: "FEATURE_NOT_INCLUDED" }, "fallback message");
    expect(result?.message).toBe("fallback message");
  });

  it("ignores non-numeric limit/used and non-string period rather than propagating a malformed value", () => {
    const result = readEntitlementError({ error: "x", code: "QUOTA_EXCEEDED", limit: "five", used: null, period: 3 }, "fallback");
    expect(result).toEqual({ code: "QUOTA_EXCEEDED", message: "x", limit: null, used: null, period: null, featureId: null });
  });

  it("ignores a non-string featureId rather than propagating a malformed value", () => {
    const result = readEntitlementError({ error: "x", code: "FEATURE_NOT_INCLUDED", featureId: 123 }, "fallback");
    expect(result?.featureId).toBeNull();
  });
});

describe("describeResetDate — Phase 19 M4, Step 2/3/6 (shared by UpgradePrompt and /settings/billing)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  // Date formatting is deliberately locale-dependent (toLocaleDateString()
  // with no fixed locale — the same convention this codebase already
  // uses elsewhere, e.g. the billing page's own renewalDate display), so
  // these assert on the underlying UTC boundary math (day/month/year
  // present, never a wrong month/year), not one fixed locale's string.

  it("MONTH resolves to the 1st of next UTC month", () => {
    const result = describeResetDate("MONTH");
    expect(result).toMatch(/^Resets /);
    expect(result).toContain("2026");
    expect(result).toMatch(/\bApr\b|\b4\b|04/);
  });

  it("DAY resolves to next UTC midnight", () => {
    const result = describeResetDate("DAY");
    expect(result).toMatch(/^Resets at midnight UTC \(.+\)$/);
    expect(result).toContain("16");
  });

  it("returns null for LIFETIME (never resets) and for an unrecognized/missing period", () => {
    expect(describeResetDate("LIFETIME")).toBeNull();
    expect(describeResetDate(null)).toBeNull();
    expect(describeResetDate(undefined)).toBeNull();
  });

  it("MONTH correctly rolls over a December -> January year boundary", () => {
    vi.setSystemTime(new Date("2026-12-20T00:00:00.000Z"));
    const result = describeResetDate("MONTH");
    expect(result).toContain("2027");
    expect(result).toMatch(/\bJan\b|\b1\b|01/);
  });
});

describe("EntitlementAwareError — Phase 19 M4, Step 5 (throw/catch boundary carrier)", () => {
  it("carries the full EntitlementErrorInfo through a throw/catch boundary, distinguishable from a plain Error", () => {
    const info = readEntitlementError({ error: "Limit reached.", code: "QUOTA_EXCEEDED", metric: "RECRUITER_CANDIDATES", limit: 10, used: 10, period: "MONTH" }, "fallback")!;

    let caught: unknown;
    try {
      throw new EntitlementAwareError(info);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(EntitlementAwareError);
    expect((caught as EntitlementAwareError).info).toEqual(info);
    expect((caught as EntitlementAwareError).message).toBe("Limit reached.");
  });
});

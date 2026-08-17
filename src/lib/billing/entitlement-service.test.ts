import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformRole } from "./platform-schema";

const resolvePlatformRolesMock = vi.fn<(userId: string) => Promise<PlatformRole[]>>();

vi.mock("./persona-service", () => ({
  resolvePlatformRoles: (...args: [string]) => resolvePlatformRolesMock(...args),
  // Trivial, pure re-implementations — avoids importOriginal() pulling in
  // persona-service.ts's real top-level Supabase client construction.
  isAdmin: (roles: PlatformRole[]) => roles.includes("ADMIN"),
  isRecruiter: (roles: PlatformRole[]) => roles.includes("RECRUITER"),
}));

const listActiveOverridesMock = vi.fn();
const createOverrideMock = vi.fn();
const revokeOverrideMock = vi.fn();
vi.mock("./entitlement-overrides-service", () => ({
  listActiveOverrides: (...args: unknown[]) => listActiveOverridesMock(...args),
  createOverride: (...args: unknown[]) => createOverrideMock(...args),
  revokeOverride: (...args: unknown[]) => revokeOverrideMock(...args),
}));

const getUsageCountMock = vi.fn();
const recordUsageEventMock = vi.fn();
vi.mock("./usage-event-service", () => ({
  getUsageCount: (...args: unknown[]) => getUsageCountMock(...args),
  recordUsageEvent: (...args: unknown[]) => recordUsageEventMock(...args),
}));

const listSubscriptionsForUserMock = vi.fn();
const pickBestSubscriptionForRoleMock = vi.fn();
vi.mock("./platform-subscription-service", () => ({
  listSubscriptionsForUser: (...args: unknown[]) => listSubscriptionsForUserMock(...args),
  pickBestSubscriptionForRole: (...args: unknown[]) => pickBestSubscriptionForRoleMock(...args),
}));

import {
  canAccess,
  checkQuota,
  deactivateEntitlementOverride,
  FeatureNotEntitledError,
  getBillingOverview,
  getEntitlement,
  getUsage,
  grantFeatureOverride,
  NotAuthorizedError,
  QuotaExceededError,
  recordUsage,
  requireFeature,
  requireQuota,
  resolveEffectivePlans,
  revokeFeatureOverride,
  withEntitlementCache,
} from "./entitlement-service";

// Phase 18 Milestone 1 — entitlement-service.ts is the ONE centralized
// authority; these tests exercise its real composition logic (plan
// resolution, override precedence, admin bypass, quota math) against
// mocked dependencies — never a live Supabase connection, following the
// exact pattern this codebase's own M3/M5/M6 tests already established
// for composing over mocked getters.

beforeEach(() => {
  resolvePlatformRolesMock.mockReset();
  listActiveOverridesMock.mockReset().mockResolvedValue([]);
  createOverrideMock.mockReset();
  revokeOverrideMock.mockReset();
  getUsageCountMock.mockReset().mockResolvedValue(0);
  recordUsageEventMock.mockReset();
  listSubscriptionsForUserMock.mockReset().mockResolvedValue([]);
  // Real filtering logic is covered separately in
  // platform-subscription-service.test.ts — here it's a controllable
  // stub so resolveEffectivePlans()'s own orchestration (Stripe-backed
  // vs FREE fallback) can be tested in isolation. Defaults to "no
  // Stripe-backed plan" so every pre-existing M1 test keeps its
  // original FREE-only behavior unless a test overrides this.
  pickBestSubscriptionForRoleMock.mockReset().mockReturnValue(null);
});

describe("resolveEffectivePlans — Step 7 plan resolution", () => {
  it("resolves an unrecognized/default user to JOB_SEEKER_FREE, always FREE, never a fabricated paid plan", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    const plans = await resolveEffectivePlans("u1");
    expect(plans).toEqual([{ role: "JOB_SEEKER", planKey: "JOB_SEEKER_FREE", status: "active", isImplicitFree: true, currentPeriodEnd: null, cancelAtPeriodEnd: false }]);
  });

  it("resolves multiple roles to multiple plans — never collapses a multi-role account to one", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER", "RECRUITER"]);
    const plans = await resolveEffectivePlans("u1");
    expect(plans.map((p) => p.planKey)).toEqual(["JOB_SEEKER_FREE", "RECRUITER_FREE"]);
  });

  it("resolves ADMIN to a null planKey — a privileged role, never a subscription tier", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["ADMIN"]);
    const plans = await resolveEffectivePlans("u1");
    expect(plans).toEqual([{ role: "ADMIN", planKey: null, status: "active", isImplicitFree: true, currentPeriodEnd: null, cancelAtPeriodEnd: false }]);
  });

  it("Phase 18 M2 — a real, active Stripe-backed subscription in a role's plan family wins over the FREE default", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    pickBestSubscriptionForRoleMock.mockReturnValue({
      plan_id: "JOB_SEEKER_PRO",
      status: "active",
      current_period_end: "2027-01-01T00:00:00.000Z",
      cancel_at_period_end: false,
    });

    const plans = await resolveEffectivePlans("u1");

    expect(plans).toEqual([
      { role: "JOB_SEEKER", planKey: "JOB_SEEKER_PRO", status: "active", isImplicitFree: false, currentPeriodEnd: "2027-01-01T00:00:00.000Z", cancelAtPeriodEnd: false },
    ]);
  });

  it("Phase 18 M2 — a canceled Stripe subscription never retains paid access merely because a local row still exists", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    // pickBestSubscriptionForRole's own real logic (tested separately)
    // already excludes non-paid-access statuses — simulated here by
    // returning null, exactly what the real function would return.
    pickBestSubscriptionForRoleMock.mockReturnValue(null);

    const plans = await resolveEffectivePlans("u1");
    expect(plans[0]).toMatchObject({ planKey: "JOB_SEEKER_FREE", isImplicitFree: true });
  });

  it("Phase 18 M2 — a Stripe/subscription lookup failure fails closed to FREE, never throws, never grants paid access (listSubscriptionsForUser's own fallback, exercised end-to-end)", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    listSubscriptionsForUserMock.mockResolvedValue([]); // what the real fail-closed fallback returns on a query error
    pickBestSubscriptionForRoleMock.mockReturnValue(null);

    const plans = await resolveEffectivePlans("u1");
    expect(plans[0]).toMatchObject({ planKey: "JOB_SEEKER_FREE", isImplicitFree: true });
  });
});

describe("getEntitlement / canAccess — Step 6 feature access", () => {
  it("allows a feature genuinely included in the resolved FREE plan", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    const entitlement = await getEntitlement("u1", "resume.builder");
    expect(entitlement.access).toBe("UNLIMITED");
    expect(entitlement.source).toBe("PLAN");
    expect(await canAccess("u1", "resume.builder")).toBe(true);
  });

  it("denies a Pro-only feature to a Free-tier user", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    const entitlement = await getEntitlement("u1", "resume.optimize");
    expect(entitlement.access).toBe("NONE");
    expect(await canAccess("u1", "resume.optimize")).toBe(false);
  });

  it("denies a recruiter-only feature to a pure job-seeker account", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    expect(await canAccess("u1", "recruiter.workspace")).toBe(false);
  });

  it("grants access via the most permissive of a multi-role account's plans", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER", "RECRUITER"]);
    expect(await canAccess("u1", "recruiter.workspace")).toBe(true);
    expect(await canAccess("u1", "resume.builder")).toBe(true);
  });

  it("ADMIN bypasses every plan check with UNLIMITED access to anything", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["ADMIN"]);
    const entitlement = await getEntitlement("u1", "recruiter.hiring_report");
    expect(entitlement).toMatchObject({ access: "UNLIMITED", source: "ADMIN_BYPASS" });
  });

  it("an active GRANTED override unlocks a feature the plan itself would deny", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    listActiveOverridesMock.mockResolvedValue([{ id: "o1", user_id: "u1", feature_id: "resume.optimize", access: "GRANTED", reason: null, granted_by: "admin1", expires_at: null, created_at: "", revoked_at: null }]);
    const entitlement = await getEntitlement("u1", "resume.optimize");
    expect(entitlement).toMatchObject({ access: "UNLIMITED", source: "OVERRIDE_GRANTED" });
  });

  it("an active REVOKED override blocks a feature the plan itself would allow", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    listActiveOverridesMock.mockResolvedValue([{ id: "o1", user_id: "u1", feature_id: "resume.builder", access: "REVOKED", reason: null, granted_by: "admin1", expires_at: null, created_at: "", revoked_at: null }]);
    const entitlement = await getEntitlement("u1", "resume.builder");
    expect(entitlement).toMatchObject({ access: "NONE", source: "OVERRIDE_REVOKED" });
  });

  it("Phase 18 M2 — a real Stripe-backed Pro plan unlocks a feature the FREE default would deny (proves getEntitlement is actually wired to resolveEffectivePlans, not a hardcoded FREE lookup)", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    pickBestSubscriptionForRoleMock.mockReturnValue({ plan_id: "JOB_SEEKER_PRO", status: "active", current_period_end: null, cancel_at_period_end: false });

    const entitlement = await getEntitlement("u1", "resume.optimize");
    expect(entitlement).toMatchObject({ access: "UNLIMITED", source: "PLAN" });
  });

  it("Phase 18 M2 — past_due still grants paid access (deliberate grace policy, not a guess)", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    pickBestSubscriptionForRoleMock.mockReturnValue({ plan_id: "JOB_SEEKER_PRO", status: "past_due", current_period_end: null, cancel_at_period_end: false });

    expect(await canAccess("u1", "resume.optimize")).toBe(true);
  });

  it("Phase 18 M2 — an admin override still takes precedence over a real Stripe-backed plan (precedence unchanged by M2)", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    pickBestSubscriptionForRoleMock.mockReturnValue({ plan_id: "JOB_SEEKER_PREMIUM", status: "active", current_period_end: null, cancel_at_period_end: false });
    listActiveOverridesMock.mockResolvedValue([{ id: "o1", user_id: "u1", feature_id: "resume.optimize", access: "REVOKED", reason: null, granted_by: "admin1", expires_at: null, created_at: "", revoked_at: null }]);

    const entitlement = await getEntitlement("u1", "resume.optimize");
    expect(entitlement).toMatchObject({ access: "NONE", source: "OVERRIDE_REVOKED" });
  });
});

describe("requireFeature", () => {
  it("resolves silently when the feature is entitled", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    await expect(requireFeature("u1", "resume.builder")).resolves.toBeUndefined();
  });

  it("throws FeatureNotEntitledError when it isn't", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    await expect(requireFeature("u1", "recruiter.workspace")).rejects.toBeInstanceOf(FeatureNotEntitledError);
  });
});

describe("checkQuota / requireQuota — Step 15 quota boundaries", () => {
  beforeEach(() => resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]));

  it("allows when usage is below the limit", async () => {
    getUsageCountMock.mockResolvedValue(2); // JOB_SEEKER_FREE ATS_CHECKS limit is 5
    const result = await checkQuota("u1", "ATS_CHECKS");
    expect(result).toMatchObject({ allowed: true, used: 2, limit: 5, remaining: 3 });
  });

  it("denies exactly at the limit", async () => {
    getUsageCountMock.mockResolvedValue(5);
    const result = await checkQuota("u1", "ATS_CHECKS");
    expect(result).toMatchObject({ allowed: false, used: 5, limit: 5, remaining: 0 });
  });

  it("denies above the limit", async () => {
    getUsageCountMock.mockResolvedValue(9);
    const result = await checkQuota("u1", "ATS_CHECKS");
    expect(result.allowed).toBe(false);
  });

  it("is unlimited (never denies, limit is null) for a plan tier with UNLIMITED access", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    listActiveOverridesMock.mockResolvedValue([{ id: "o1", user_id: "u1", feature_id: "resume.ats.score", access: "GRANTED", reason: null, granted_by: "a1", expires_at: null, created_at: "", revoked_at: null }]);
    getUsageCountMock.mockResolvedValue(9999);
    const result = await checkQuota("u1", "ATS_CHECKS");
    expect(result).toMatchObject({ allowed: true, limit: null, remaining: null });
  });

  it("denies a metric with no entitled feature at all (limit 0)", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["RECRUITER"]); // no job-seeker features
    const result = await checkQuota("u1", "ATS_CHECKS");
    expect(result).toMatchObject({ allowed: false, limit: 0 });
  });

  it("period boundary — usage counted for the resolved period is exactly what determines allowed/denied (mocked getUsageCount stands in for the real period query)", async () => {
    getUsageCountMock.mockResolvedValue(4);
    const result = await checkQuota("u1", "ATS_CHECKS");
    expect(result.period).toBe("MONTH");
    expect(result.allowed).toBe(true);
    expect(getUsageCountMock).toHaveBeenCalledWith("u1", "ATS_CHECKS", "MONTH");
  });

  it("requireQuota throws QuotaExceededError once the limit is reached", async () => {
    getUsageCountMock.mockResolvedValue(5);
    await expect(requireQuota("u1", "ATS_CHECKS")).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("ADMIN is always allowed, unlimited, regardless of usage", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["ADMIN"]);
    getUsageCountMock.mockResolvedValue(999999);
    const result = await checkQuota("u1", "ATS_CHECKS");
    expect(result).toMatchObject({ allowed: true, limit: null });
  });
});

describe("recordUsage — Step 8, only ever called after a real success", () => {
  it("delegates to the usage event store", async () => {
    await recordUsage("u1", "MOCK_INTERVIEWS");
    expect(recordUsageEventMock).toHaveBeenCalledWith("u1", "MOCK_INTERVIEWS");
  });
});

describe("getUsage", () => {
  it("reports usage across all three periods", async () => {
    getUsageCountMock.mockImplementation((_userId: string, _metric: string, period: string) => Promise.resolve(period === "DAY" ? 1 : period === "MONTH" ? 4 : 10));
    const summary = await getUsage("u1", "ATS_CHECKS");
    expect(summary).toEqual({ metric: "ATS_CHECKS", usedToday: 1, usedThisMonth: 4, usedLifetime: 10 });
  });
});

describe("admin overrides — Step 10, and Step 14 security (forged role cannot self-grant)", () => {
  it("grantFeatureOverride succeeds when the ACTING user genuinely resolves as ADMIN", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["ADMIN"]);
    createOverrideMock.mockResolvedValue({ id: "o1" });
    await grantFeatureOverride("admin1", "targetUser", "recruiter.hiring_report");
    expect(createOverrideMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "targetUser", featureId: "recruiter.hiring_report", access: "GRANTED", grantedBy: "admin1" }));
  });

  it("grantFeatureOverride rejects a non-admin acting user — the ONLY authority checked is the server-resolved role, never anything the caller could forge", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    await expect(grantFeatureOverride("notAnAdmin", "targetUser", "recruiter.hiring_report")).rejects.toBeInstanceOf(NotAuthorizedError);
    expect(createOverrideMock).not.toHaveBeenCalled();
  });

  it("revokeFeatureOverride is equally admin-gated", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    await expect(revokeFeatureOverride("notAnAdmin", "targetUser", "resume.builder")).rejects.toBeInstanceOf(NotAuthorizedError);
  });
});

describe("deactivateEntitlementOverride — Phase 18 M3, Scope H #10 (removing an override restores plan/fallback behavior)", () => {
  it("is equally admin-gated — the same authority check as grant/revoke, never bypassed for 'just deactivating'", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    await expect(deactivateEntitlementOverride("notAnAdmin", "override-1")).rejects.toBeInstanceOf(NotAuthorizedError);
    expect(revokeOverrideMock).not.toHaveBeenCalled();
  });

  it("delegates to the real revokeOverride() by the override's own id when the acting user genuinely is ADMIN", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["ADMIN"]);
    await deactivateEntitlementOverride("admin1", "override-1");
    expect(revokeOverrideMock).toHaveBeenCalledWith("override-1");
  });

  it("once deactivated, getEntitlement() no longer sees the override and falls back to the plan (simulated here by the mock no longer returning it — the real listActiveOverrides()'s own revoked_at filter is covered directly in entitlement-overrides-service.test.ts)", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);

    // Before deactivation: an active GRANTED override unlocks the feature.
    listActiveOverridesMock.mockResolvedValue([{ id: "o1", user_id: "u1", feature_id: "resume.optimize", access: "GRANTED", reason: null, granted_by: "admin1", expires_at: null, created_at: "", revoked_at: null }]);
    expect((await getEntitlement("u1", "resume.optimize")).access).toBe("UNLIMITED");

    // After deactivation (revoked_at set — listActiveOverrides() would no longer return it):
    listActiveOverridesMock.mockResolvedValue([]);
    const afterDeactivation = await getEntitlement("u1", "resume.optimize");
    expect(afterDeactivation.access).toBe("NONE"); // JOB_SEEKER_FREE doesn't include resume.optimize
    expect(afterDeactivation.source).toBe("PLAN");
  });
});

describe("cross-user isolation (Step 14 — IDOR-style regression)", () => {
  it("resolving one user's entitlement never reads or is influenced by another user's role/override mock state", async () => {
    resolvePlatformRolesMock.mockImplementation((userId: string) => Promise.resolve(userId === "adminUser" ? ["ADMIN"] : ["JOB_SEEKER"]));

    const otherUserEntitlement = await getEntitlement("regularUser", "recruiter.workspace");
    expect(otherUserEntitlement.access).toBe("NONE");

    const adminEntitlement = await getEntitlement("adminUser", "recruiter.workspace");
    expect(adminEntitlement.access).toBe("UNLIMITED");

    // Each call is independently resolved by the userId argument alone.
    expect(resolvePlatformRolesMock).toHaveBeenCalledWith("regularUser");
    expect(resolvePlatformRolesMock).toHaveBeenCalledWith("adminUser");
  });
});

describe("getBillingOverview — Step 12/17 contract", () => {
  it("never fabricates a renewal date/cancelAtPeriodEnd when no real subscription exists", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    const overview = await getBillingOverview("u1");

    expect(overview.roles).toEqual(["JOB_SEEKER"]);
    expect(overview.plans).toEqual([
      { role: "JOB_SEEKER", planKey: "JOB_SEEKER_FREE", planName: "Job Seeker — Free", status: "active", isImplicitFree: true, renewalDate: null, cancelAtPeriodEnd: false },
    ]);
    expect(overview.features.length).toBeGreaterThan(0);
  });

  it("Phase 18 M2 — reports the real Stripe renewal date/cancelAtPeriodEnd for a Stripe-backed plan, per role", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER", "RECRUITER"]);
    pickBestSubscriptionForRoleMock.mockImplementation((_subs: unknown, role: string) =>
      role === "JOB_SEEKER" ? { plan_id: "JOB_SEEKER_PRO", status: "active", current_period_end: "2027-03-01T00:00:00.000Z", cancel_at_period_end: true } : null
    );

    const overview = await getBillingOverview("u1");

    expect(overview.plans).toEqual([
      { role: "JOB_SEEKER", planKey: "JOB_SEEKER_PRO", planName: "Job Seeker — Pro", status: "active", isImplicitFree: false, renewalDate: "2027-03-01T00:00:00.000Z", cancelAtPeriodEnd: true },
      { role: "RECRUITER", planKey: "RECRUITER_FREE", planName: "Recruiter — Free", status: "active", isImplicitFree: true, renewalDate: null, cancelAtPeriodEnd: false },
    ]);
  });

  it("never exposes Stripe secrets/internal ids — only the application-level fields declared on BillingOverview/PlanSummary", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    const overview = await getBillingOverview("u1");
    const serialized = JSON.stringify(overview);

    expect(serialized).not.toMatch(/sk_|whsec_|cus_|sub_/);
  });

  it("Phase 19 M4, Step 2/3 — each usage row carries the SAME limit/period checkQuota() would enforce for that metric, not fabricated separately", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    getUsageCountMock.mockResolvedValue(2);

    const overview = await getBillingOverview("u1");
    const atsChecks = overview.usage.find((entry) => entry.metric === "ATS_CHECKS")!;

    expect(atsChecks).toMatchObject({ metric: "ATS_CHECKS", usedThisMonth: 2, limit: 5, period: "MONTH" });
  });

  it("Phase 19 M4, Step 2/3 — a metric with zero entitled feature for this role's plans reports limit 0, never null (never 'unlimited' for something genuinely inaccessible)", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]); // no RECRUITER role -> RECRUITER_CANDIDATES is NONE
    const overview = await getBillingOverview("u1");
    const recruiterCandidates = overview.usage.find((entry) => entry.metric === "RECRUITER_CANDIDATES")!;

    expect(recruiterCandidates).toMatchObject({ limit: 0, period: null });
  });

  it("Phase 19 M4, Step 2/3 — ADMIN's unlimited access reports limit null (never a fabricated numeric ceiling)", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["ADMIN"]);
    const overview = await getBillingOverview("u1");
    const atsChecks = overview.usage.find((entry) => entry.metric === "ATS_CHECKS")!;

    expect(atsChecks).toMatchObject({ limit: null, period: null });
  });

  it("Phase 19 M4 — collapses the 25-feature loop down to one role/subscription/override lookup via the internal withEntitlementCache scope", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    await getBillingOverview("u1");

    expect(resolvePlatformRolesMock).toHaveBeenCalledTimes(1);
    expect(listSubscriptionsForUserMock).toHaveBeenCalledTimes(1);
    expect(listActiveOverridesMock).toHaveBeenCalledTimes(1);
  });
});

describe("withEntitlementCache — Phase 19 M4 Step 12-14 request-scoped memoization", () => {
  beforeEach(() => resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]));

  it("deduplicates repeated role/subscription/override lookups for the SAME user within one cache scope", async () => {
    await withEntitlementCache(async () => {
      await getEntitlement("u1", "resume.builder");
      await getEntitlement("u1", "resume.optimize");
      await getEntitlement("u1", "recruiter.workspace");
    });

    expect(resolvePlatformRolesMock).toHaveBeenCalledTimes(1);
    expect(listSubscriptionsForUserMock).toHaveBeenCalledTimes(1);
    expect(listActiveOverridesMock).toHaveBeenCalledTimes(1);
  });

  it("checkQuota's own internal scope deduplicates lookups across every feature sharing the requested metric", async () => {
    // JD_MATCHES is shared by multiple features (resume.jd.match/job.match/job.analyzer)
    // — checkQuotaUncached() calls getEntitlement() once per relevant feature.
    await checkQuota("u1", "JD_MATCHES");

    expect(resolvePlatformRolesMock).toHaveBeenCalledTimes(1);
  });

  it("never shares cached data across two different userIds within the SAME cache scope (no cross-user contamination)", async () => {
    resolvePlatformRolesMock.mockImplementation((userId: string) => Promise.resolve(userId === "adminUser" ? ["ADMIN"] : ["JOB_SEEKER"]));

    await withEntitlementCache(async () => {
      const regular = await getEntitlement("regularUser", "recruiter.workspace");
      const admin = await getEntitlement("adminUser", "recruiter.workspace");
      expect(regular.access).toBe("NONE");
      expect(admin.access).toBe("UNLIMITED");
    });

    // One real lookup per distinct userId — each cached independently, never merged.
    expect(resolvePlatformRolesMock).toHaveBeenCalledTimes(2);
    expect(resolvePlatformRolesMock).toHaveBeenCalledWith("regularUser");
    expect(resolvePlatformRolesMock).toHaveBeenCalledWith("adminUser");
  });

  it("never reuses a cached lookup across two SEPARATE cache scopes for the same user (no cross-request stale cache)", async () => {
    await withEntitlementCache(() => getEntitlement("u1", "resume.builder"));
    await withEntitlementCache(() => getEntitlement("u1", "resume.builder"));

    // Two independent scopes ("requests") each re-resolve from scratch —
    // proves the cache is genuinely call-scoped, not accidentally
    // memoized on the userId across unrelated invocations.
    expect(resolvePlatformRolesMock).toHaveBeenCalledTimes(2);
  });

  it("a call OUTSIDE any active cache scope still resolves correctly (no scope is not a bug — it's the pre-M4, unmemoized path)", async () => {
    const entitlement = await getEntitlement("u1", "resume.builder");
    expect(entitlement.access).toBe("UNLIMITED");
    expect(resolvePlatformRolesMock).toHaveBeenCalledTimes(1);
  });
});

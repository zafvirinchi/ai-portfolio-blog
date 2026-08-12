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
vi.mock("./entitlement-overrides-service", () => ({
  listActiveOverrides: (...args: unknown[]) => listActiveOverridesMock(...args),
  createOverride: (...args: unknown[]) => createOverrideMock(...args),
}));

const getUsageCountMock = vi.fn();
const recordUsageEventMock = vi.fn();
vi.mock("./usage-event-service", () => ({
  getUsageCount: (...args: unknown[]) => getUsageCountMock(...args),
  recordUsageEvent: (...args: unknown[]) => recordUsageEventMock(...args),
}));

import {
  canAccess,
  checkQuota,
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
  getUsageCountMock.mockReset().mockResolvedValue(0);
  recordUsageEventMock.mockReset();
});

describe("resolveEffectivePlans — Step 7 plan resolution", () => {
  it("resolves an unrecognized/default user to JOB_SEEKER_FREE, always FREE, never a fabricated paid plan", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    const plans = await resolveEffectivePlans("u1");
    expect(plans).toEqual([{ role: "JOB_SEEKER", planKey: "JOB_SEEKER_FREE", status: "active", isImplicitFree: true }]);
  });

  it("resolves multiple roles to multiple plans — never collapses a multi-role account to one", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER", "RECRUITER"]);
    const plans = await resolveEffectivePlans("u1");
    expect(plans.map((p) => p.planKey)).toEqual(["JOB_SEEKER_FREE", "RECRUITER_FREE"]);
  });

  it("resolves ADMIN to a null planKey — a privileged role, never a subscription tier", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["ADMIN"]);
    const plans = await resolveEffectivePlans("u1");
    expect(plans).toEqual([{ role: "ADMIN", planKey: null, status: "active", isImplicitFree: true }]);
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

describe("getBillingOverview — Step 17 contract", () => {
  it("never fabricates renewalDate/cancelAtPeriodEnd when no real subscription exists", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);
    const overview = await getBillingOverview("u1");
    expect(overview.renewalDate).toBeUndefined();
    expect(overview.cancelAtPeriodEnd).toBeUndefined();
    expect(overview.isImplicitFree).toBe(true);
    expect(overview.roles).toEqual(["JOB_SEEKER"]);
    expect(overview.plans).toEqual(["JOB_SEEKER_FREE"]);
    expect(overview.features.length).toBeGreaterThan(0);
  });
});

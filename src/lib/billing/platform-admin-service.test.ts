import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserByIdMock = vi.fn();
const listUsersMock = vi.fn();
const usageCountMock = vi.fn();

vi.mock("../supabase/admin", () => ({
  supabaseAdmin: {
    auth: { admin: { getUserById: (...args: unknown[]) => getUserByIdMock(...args), listUsers: (...args: unknown[]) => listUsersMock(...args) } },
    from: () => ({
      select: () => ({
        eq: () => usageCountMock(),
      }),
    }),
  },
}));

const recordMock = vi.fn();
const listByObjectMock = vi.fn();
vi.mock("../saas/audit-service", () => ({
  record: (...args: unknown[]) => recordMock(...args),
  listByObject: (...args: unknown[]) => listByObjectMock(...args),
}));

const resolvePlatformRolesMock = vi.fn();
const setPlatformRolesMock = vi.fn();
vi.mock("./persona-service", () => ({
  resolvePlatformRoles: (...args: unknown[]) => resolvePlatformRolesMock(...args),
  setPlatformRoles: (...args: unknown[]) => setPlatformRolesMock(...args),
}));

const resolveEffectivePlansMock = vi.fn();
const getEntitlementMock = vi.fn();
const getUsageMock = vi.fn();
const grantFeatureOverrideMock = vi.fn();
const revokeFeatureOverrideMock = vi.fn();
const deactivateEntitlementOverrideMock = vi.fn();
vi.mock("./entitlement-service", () => ({
  resolveEffectivePlans: (...args: unknown[]) => resolveEffectivePlansMock(...args),
  getEntitlement: (...args: unknown[]) => getEntitlementMock(...args),
  getUsage: (...args: unknown[]) => getUsageMock(...args),
  grantFeatureOverride: (...args: unknown[]) => grantFeatureOverrideMock(...args),
  revokeFeatureOverride: (...args: unknown[]) => revokeFeatureOverrideMock(...args),
  deactivateEntitlementOverride: (...args: unknown[]) => deactivateEntitlementOverrideMock(...args),
  // Phase 19 Milestone 4 — a real passthrough (not a mock to assert on):
  // getPlatformUserDetail() wraps its own Promise.all in this to reuse
  // entitlement-service.ts's request-scoped cache; every function it
  // wraps here is already independently mocked above, so the cache
  // itself has nothing to do in this test file and is never asserted on.
  withEntitlementCache: (fn: () => unknown) => fn(),
}));

const listAllOverridesForUserMock = vi.fn();
const getOverrideByIdMock = vi.fn();
vi.mock("./entitlement-overrides-service", () => ({
  listAllOverridesForUser: (...args: unknown[]) => listAllOverridesForUserMock(...args),
  getOverrideById: (...args: unknown[]) => getOverrideByIdMock(...args),
}));

const getCustomerByUserIdMock = vi.fn();
const listSubscriptionsForUserMock = vi.fn();
vi.mock("./platform-subscription-service", () => ({
  getCustomerByUserId: (...args: unknown[]) => getCustomerByUserIdMock(...args),
  listSubscriptionsForUser: (...args: unknown[]) => listSubscriptionsForUserMock(...args),
}));

import {
  assignPlatformRole,
  deactivateOverrideByAdmin,
  getPlatformUserDetail,
  grantOverrideByAdmin,
  InvalidFeatureIdError,
  InvalidPersonaError,
  LastAdminError,
  OverrideNotFoundError,
  removePlatformRole,
  revokeOverrideByAdmin,
  searchPlatformUsers,
  SelfLockoutConfirmationRequiredError,
  UserNotFoundError,
} from "./platform-admin-service";

// Phase 18 Milestone 3 — platform-admin-service.ts is the admin-workflow
// layer built ON TOP of M1's entitlement-service.ts (mocked here — its
// own real decision logic, including the admin-authorization check
// inside grant/revoke/deactivate, is already covered directly in
// entitlement-service.test.ts) and M2's platform-subscription-service.ts.
// These tests exercise this file's OWN logic: search, aggregation,
// validation, and the role-change safety guards (Scope H #3-9, #12-14).

const fakeReq = new Request("https://example.com/api/admin/platform/x", { method: "POST" });

function fakeAuthUser(id: string, email: string | null = null, createdAt = "2026-01-01T00:00:00.000Z") {
  return { id, email, created_at: createdAt, app_metadata: {} };
}

beforeEach(() => {
  getUserByIdMock.mockReset();
  listUsersMock.mockReset();
  usageCountMock.mockReset().mockResolvedValue({ count: 0, error: null });
  recordMock.mockReset();
  listByObjectMock.mockReset().mockResolvedValue([]);
  resolvePlatformRolesMock.mockReset().mockResolvedValue(["JOB_SEEKER"]);
  setPlatformRolesMock.mockReset();
  resolveEffectivePlansMock.mockReset().mockResolvedValue([]);
  getEntitlementMock.mockReset();
  getUsageMock.mockReset();
  grantFeatureOverrideMock.mockReset();
  revokeFeatureOverrideMock.mockReset();
  deactivateEntitlementOverrideMock.mockReset();
  listAllOverridesForUserMock.mockReset().mockResolvedValue([]);
  getOverrideByIdMock.mockReset();
  getCustomerByUserIdMock.mockReset().mockResolvedValue(null);
  listSubscriptionsForUserMock.mockReset().mockResolvedValue([]);
});

describe("searchPlatformUsers — Scope A", () => {
  it("looks up an exact userId directly, without paginating", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: fakeAuthUser("u1", "u1@example.com") }, error: null });
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);

    const results = await searchPlatformUsers({ userId: "u1" });

    expect(results).toEqual([{ userId: "u1", email: "u1@example.com", createdAt: "2026-01-01T00:00:00.000Z", roles: ["JOB_SEEKER"] }]);
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("returns an empty list for an unknown userId, never throwing", async () => {
    getUserByIdMock.mockResolvedValue({ data: null, error: { message: "not found" } });
    expect(await searchPlatformUsers({ userId: "nonexistent" })).toEqual([]);
  });

  it("filters paginated results by email substring (case-insensitive)", async () => {
    listUsersMock.mockResolvedValueOnce({ data: { users: [fakeAuthUser("u1", "Jane@Example.com"), fakeAuthUser("u2", "bob@example.com")] }, error: null });
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);

    const results = await searchPlatformUsers({ email: "jane" });
    expect(results.map((r) => r.userId)).toEqual(["u1"]);
  });

  it("filters paginated results by role", async () => {
    listUsersMock.mockResolvedValueOnce({ data: { users: [fakeAuthUser("u1"), fakeAuthUser("u2")] }, error: null });
    resolvePlatformRolesMock.mockImplementation((userId: string) => Promise.resolve(userId === "u2" ? ["RECRUITER"] : ["JOB_SEEKER"]));

    const results = await searchPlatformUsers({ role: "RECRUITER" });
    expect(results.map((r) => r.userId)).toEqual(["u2"]);
  });

  it("never exposes unnecessary PII — only userId/email/createdAt/roles", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { ...fakeAuthUser("u1", "u1@example.com"), phone: "+1-555-0100", identities: [{ provider: "google" }] } }, error: null });
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);

    const [result] = await searchPlatformUsers({ userId: "u1" });
    expect(Object.keys(result).sort()).toEqual(["createdAt", "email", "roles", "userId"]);
  });
});

describe("getPlatformUserDetail — Scope C/D/E, #8/#9/#14", () => {
  it("returns null for an unknown user rather than a partially-fabricated detail object", async () => {
    getUserByIdMock.mockResolvedValue({ data: null, error: { message: "not found" } });
    expect(await getPlatformUserDetail("nonexistent")).toBeNull();
  });

  it("resolves the effective plan via resolveEffectivePlans() — the SAME centralized function every other caller uses, never a parallel computation (#9)", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: fakeAuthUser("u1") }, error: null });
    resolveEffectivePlansMock.mockResolvedValue([{ role: "JOB_SEEKER", planKey: "JOB_SEEKER_PRO", status: "active", isImplicitFree: false, currentPeriodEnd: null, cancelAtPeriodEnd: false }]);

    const detail = await getPlatformUserDetail("u1");

    expect(resolveEffectivePlansMock).toHaveBeenCalledWith("u1");
    expect(detail?.plans[0].planKey).toBe("JOB_SEEKER_PRO");
  });

  it("degrades honestly (null customer, empty subscriptions) when billing tables are unavailable — never fabricates a record (#14)", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: fakeAuthUser("u1") }, error: null });
    getCustomerByUserIdMock.mockResolvedValue(null); // platform-subscription-service.ts's own fail-closed behavior
    listSubscriptionsForUserMock.mockResolvedValue([]);

    const detail = await getPlatformUserDetail("u1");

    expect(detail?.billingCustomer).toBeNull();
    expect(detail?.subscriptions).toEqual([]);
  });

  it("only ever requests overrides/subscriptions/usage for the exact userId passed — never another user's (#8, cross-user isolation)", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: fakeAuthUser("u1") }, error: null });
    await getPlatformUserDetail("u1");

    expect(listAllOverridesForUserMock).toHaveBeenCalledWith("u1");
    expect(getCustomerByUserIdMock).toHaveBeenCalledWith("u1");
    expect(listSubscriptionsForUserMock).toHaveBeenCalledWith("u1");
    expect(listByObjectMock).toHaveBeenCalledWith("platform_user", "u1", 25);
  });
});

describe("assignPlatformRole / removePlatformRole — Scope B, #4/#5/#12", () => {
  it("rejects an invalid persona string with InvalidPersonaError (never reaches setPlatformRoles) — #5", async () => {
    await expect(assignPlatformRole(fakeReq, "admin1", "u1", "SUPER_ADMIN")).rejects.toBeInstanceOf(InvalidPersonaError);
    expect(setPlatformRolesMock).not.toHaveBeenCalled();
  });

  it("rejects assignment to a nonexistent user", async () => {
    getUserByIdMock.mockResolvedValue({ data: null, error: { message: "not found" } });
    await expect(assignPlatformRole(fakeReq, "admin1", "ghost", "JOB_SEEKER")).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it("a real admin CAN assign ADMIN to another real user — #4 confirms this is gated, not blocked outright", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: fakeAuthUser("u2") }, error: null });
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);

    const roles = await assignPlatformRole(fakeReq, "admin1", "u2", "ADMIN");

    expect(roles).toEqual(["JOB_SEEKER", "ADMIN"]);
    expect(setPlatformRolesMock).toHaveBeenCalledWith("u2", ["JOB_SEEKER", "ADMIN"]);
    expect(recordMock).toHaveBeenCalledWith(fakeReq, expect.objectContaining({ action: "platform.role.assigned", objectId: "u2", userId: "admin1" }));
  });

  it("is idempotent (no-op, no audit entry) when the user already has the role", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: fakeAuthUser("u2") }, error: null });
    resolvePlatformRolesMock.mockResolvedValue(["RECRUITER"]);

    await assignPlatformRole(fakeReq, "admin1", "u2", "RECRUITER");

    expect(setPlatformRolesMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("blocks removing the LAST administrator system-wide — #12", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: fakeAuthUser("theOnlyAdmin") }, error: null });
    resolvePlatformRolesMock.mockResolvedValue(["ADMIN"]);
    listUsersMock.mockResolvedValueOnce({ data: { users: [fakeAuthUser("theOnlyAdmin")] }, error: null });

    await expect(removePlatformRole(fakeReq, "someOtherAdmin", "theOnlyAdmin", "ADMIN")).rejects.toBeInstanceOf(LastAdminError);
    expect(setPlatformRolesMock).not.toHaveBeenCalled();
  });

  it("requires explicit confirmSelfRemoval when an admin removes their OWN admin role, even with other admins present", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: fakeAuthUser("admin1") }, error: null });
    resolvePlatformRolesMock.mockResolvedValue(["ADMIN"]);

    await expect(removePlatformRole(fakeReq, "admin1", "admin1", "ADMIN")).rejects.toBeInstanceOf(SelfLockoutConfirmationRequiredError);
    expect(setPlatformRolesMock).not.toHaveBeenCalled();
  });

  it("allows self-removal once confirmed AND another admin still exists", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: fakeAuthUser("admin1") }, error: null });
    listUsersMock.mockResolvedValueOnce({ data: { users: [fakeAuthUser("admin1"), fakeAuthUser("admin2")] }, error: null });
    // Both resolve as ADMIN — for the target-user's current-roles lookup AND the countUsersWithRole() scan.
    resolvePlatformRolesMock.mockResolvedValue(["ADMIN"]);

    const roles = await removePlatformRole(fakeReq, "admin1", "admin1", "ADMIN", { confirmSelfRemoval: true });
    expect(roles).toEqual([]);
    expect(setPlatformRolesMock).toHaveBeenCalledWith("admin1", []);
  });

  it("removing a role from ANOTHER user never requires self-removal confirmation", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: fakeAuthUser("u2") }, error: null });
    resolvePlatformRolesMock.mockResolvedValue(["RECRUITER"]);

    const roles = await removePlatformRole(fakeReq, "admin1", "u2", "RECRUITER");
    expect(roles).toEqual([]);
  });
});

describe("grantOverrideByAdmin / revokeOverrideByAdmin — Scope C, #6/#7", () => {
  it("rejects an invalid feature id before entitlement-service.ts is ever called — #6", async () => {
    await expect(grantOverrideByAdmin(fakeReq, "admin1", "u1", "not.a.real.feature")).rejects.toBeInstanceOf(InvalidFeatureIdError);
    expect(grantFeatureOverrideMock).not.toHaveBeenCalled();
  });

  it("grants the override for the intended TARGET user, not the acting admin — #7", async () => {
    grantFeatureOverrideMock.mockResolvedValue({ id: "o1", user_id: "targetUser", feature_id: "resume.optimize" });

    await grantOverrideByAdmin(fakeReq, "admin1", "targetUser", "resume.optimize", { reason: "beta" });

    expect(grantFeatureOverrideMock).toHaveBeenCalledWith("admin1", "targetUser", "resume.optimize", { reason: "beta", expiresAt: undefined });
    expect(recordMock).toHaveBeenCalledWith(fakeReq, expect.objectContaining({ objectId: "targetUser", userId: "admin1" }));
  });

  it("revoke path is equally feature-id-validated", async () => {
    await expect(revokeOverrideByAdmin(fakeReq, "admin1", "u1", "bogus")).rejects.toBeInstanceOf(InvalidFeatureIdError);
  });
});

describe("deactivateOverrideByAdmin — Scope C", () => {
  it("rejects an unknown overrideId with OverrideNotFoundError", async () => {
    getOverrideByIdMock.mockResolvedValue(null);
    await expect(deactivateOverrideByAdmin(fakeReq, "admin1", "nonexistent")).rejects.toBeInstanceOf(OverrideNotFoundError);
    expect(deactivateEntitlementOverrideMock).not.toHaveBeenCalled();
  });

  it("resolves the target user from the override row itself — the client never supplies it", async () => {
    getOverrideByIdMock.mockResolvedValue({ id: "o1", user_id: "realTargetUser", feature_id: "resume.optimize", access: "GRANTED", reason: null, granted_by: "admin1", expires_at: null, created_at: "", revoked_at: null });

    await deactivateOverrideByAdmin(fakeReq, "admin1", "o1");

    expect(deactivateEntitlementOverrideMock).toHaveBeenCalledWith("admin1", "o1");
    expect(recordMock).toHaveBeenCalledWith(fakeReq, expect.objectContaining({ objectId: "realTargetUser" }));
  });
});

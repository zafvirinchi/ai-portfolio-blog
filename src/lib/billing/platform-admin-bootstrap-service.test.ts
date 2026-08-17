import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserByIdMock = vi.fn();
const auditLimitMock = vi.fn();
vi.mock("../supabase/admin", () => ({
  supabaseAdmin: {
    auth: { admin: { getUserById: (...args: unknown[]) => getUserByIdMock(...args) } },
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: (...args: unknown[]) => auditLimitMock(...args),
        }),
      }),
    }),
  },
}));

const recordMock = vi.fn();
vi.mock("../saas/audit-service", () => ({
  record: (...args: unknown[]) => recordMock(...args),
}));

const resolvePlatformRolesMock = vi.fn();
const setPlatformRolesMock = vi.fn();
vi.mock("./persona-service", () => ({
  isAdmin: (roles: string[]) => roles.includes("ADMIN"),
  resolvePlatformRoles: (...args: unknown[]) => resolvePlatformRolesMock(...args),
  setPlatformRoles: (...args: unknown[]) => setPlatformRolesMock(...args),
}));

import { BootstrapNotConfiguredError, BootstrapSecretInvalidError, BootstrapUserNotFoundError, bootstrapPlatformAdmin, hasAnyBootstrapGrant } from "./platform-admin-bootstrap-service";

// Phase 18 Milestone 4, Step 3/4/5/10 — establishing the FIRST admin.
// The target is always the SECOND argument (the caller's own,
// independently-resolved userId) — there is no third "targetUserId"
// parameter anywhere in this function's signature, which is the
// structural reason this can never become a general role-assignment
// API (#11): there is nothing here for a request body to redirect.

const fakeReq = new Request("https://example.com/api/admin/bootstrap", { method: "POST" });
const REAL_SECRET = "correct-operator-secret-value";

function fakeAuthUser(id: string) {
  return { id, email: `${id}@example.com`, created_at: "2026-01-01T00:00:00.000Z", app_metadata: {} };
}

beforeEach(() => {
  getUserByIdMock.mockReset().mockResolvedValue({ data: { user: fakeAuthUser("caller1") }, error: null });
  auditLimitMock.mockReset().mockResolvedValue({ data: [], error: null });
  recordMock.mockReset();
  resolvePlatformRolesMock.mockReset().mockResolvedValue(["JOB_SEEKER"]);
  setPlatformRolesMock.mockReset();
  process.env.PLATFORM_ADMIN_BOOTSTRAP_SECRET = REAL_SECRET;
});

afterEach(() => {
  delete process.env.PLATFORM_ADMIN_BOOTSTRAP_SECRET;
});

describe("bootstrapPlatformAdmin — secret validation, #5/#6", () => {
  it("fails closed with BootstrapNotConfiguredError when no secret is configured on the server — creates no one", async () => {
    delete process.env.PLATFORM_ADMIN_BOOTSTRAP_SECRET;

    await expect(bootstrapPlatformAdmin(fakeReq, "caller1", "anything")).rejects.toBeInstanceOf(BootstrapNotConfiguredError);
    expect(setPlatformRolesMock).not.toHaveBeenCalled();
  });

  it("rejects a missing secret — #6, an authenticated caller alone is not enough", async () => {
    await expect(bootstrapPlatformAdmin(fakeReq, "caller1", null)).rejects.toBeInstanceOf(BootstrapSecretInvalidError);
    expect(setPlatformRolesMock).not.toHaveBeenCalled();
  });

  it("rejects an incorrect secret — #5", async () => {
    await expect(bootstrapPlatformAdmin(fakeReq, "caller1", "wrong-guess")).rejects.toBeInstanceOf(BootstrapSecretInvalidError);
    expect(setPlatformRolesMock).not.toHaveBeenCalled();
  });

  it("rejects a secret of a different length without throwing a raw crypto error", async () => {
    await expect(bootstrapPlatformAdmin(fakeReq, "caller1", "x")).rejects.toBeInstanceOf(BootstrapSecretInvalidError);
  });
});

describe("bootstrapPlatformAdmin — target resolution, #7/#16", () => {
  it("fails safely with BootstrapUserNotFoundError if the caller's own account can't be resolved server-side", async () => {
    getUserByIdMock.mockResolvedValue({ data: null, error: { message: "not found" } });

    await expect(bootstrapPlatformAdmin(fakeReq, "ghost", REAL_SECRET)).rejects.toBeInstanceOf(BootstrapUserNotFoundError);
    expect(setPlatformRolesMock).not.toHaveBeenCalled();
  });

  it("always grants to the callerUserId argument — there is no other identity input this function accepts (#16)", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["RECRUITER"]);

    const result = await bootstrapPlatformAdmin(fakeReq, "caller1", REAL_SECRET);

    expect(result.userId).toBe("caller1");
    expect(setPlatformRolesMock).toHaveBeenCalledWith("caller1", expect.arrayContaining(["ADMIN"]));
  });
});

describe("bootstrapPlatformAdmin — role preservation and grant, #8/#9/#17", () => {
  it("preserves every existing role, adding ADMIN additively — #8", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER", "RECRUITER"]);

    const result = await bootstrapPlatformAdmin(fakeReq, "caller1", REAL_SECRET);

    expect(result.roles).toEqual(["JOB_SEEKER", "RECRUITER", "ADMIN"]);
    expect(setPlatformRolesMock).toHaveBeenCalledWith("caller1", ["JOB_SEEKER", "RECRUITER", "ADMIN"]);
  });

  it("adds ADMIN exactly once, never duplicating it in the array — #9", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);

    const result = await bootstrapPlatformAdmin(fakeReq, "caller1", REAL_SECRET);

    expect(result.roles.filter((r) => r === "ADMIN")).toHaveLength(1);
  });

  it("records a single audit_logs entry via the EXISTING audit mechanism — never a second audit system — #17", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);

    await bootstrapPlatformAdmin(fakeReq, "caller1", REAL_SECRET);

    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock).toHaveBeenCalledWith(
      fakeReq,
      expect.objectContaining({ action: "platform.bootstrap.admin_granted", objectType: "platform_user", objectId: "caller1", userId: "caller1", organizationId: null })
    );
  });

  it("never returns the configured secret, and never logs it, anywhere in the result", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER"]);

    const result = await bootstrapPlatformAdmin(fakeReq, "caller1", REAL_SECRET);

    expect(JSON.stringify(result)).not.toContain(REAL_SECRET);
  });
});

describe("bootstrapPlatformAdmin — idempotency, #10", () => {
  it("returns a safe already-admin result without a duplicate grant when the caller already holds ADMIN", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["ADMIN"]);

    const result = await bootstrapPlatformAdmin(fakeReq, "caller1", REAL_SECRET);

    expect(result).toEqual({ userId: "caller1", roles: ["ADMIN"], alreadyAdmin: true });
    expect(setPlatformRolesMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("multi-role admins are still recognized as already-admin, no duplicate write", async () => {
    resolvePlatformRolesMock.mockResolvedValue(["JOB_SEEKER", "ADMIN"]);

    const result = await bootstrapPlatformAdmin(fakeReq, "caller1", REAL_SECRET);

    expect(result.alreadyAdmin).toBe(true);
    expect(setPlatformRolesMock).not.toHaveBeenCalled();
  });
});

describe("hasAnyBootstrapGrant — informational marker reused from audit_logs, Step 5 (no new table)", () => {
  it("returns false when no bootstrap grant has ever been recorded", async () => {
    auditLimitMock.mockResolvedValue({ data: [], error: null });
    expect(await hasAnyBootstrapGrant()).toBe(false);
  });

  it("returns true once a prior grant exists", async () => {
    auditLimitMock.mockResolvedValue({ data: [{ id: "log1" }], error: null });
    expect(await hasAnyBootstrapGrant()).toBe(true);
  });

  it("degrades to false (never throws) if the audit_logs query itself fails", async () => {
    auditLimitMock.mockResolvedValue({ data: null, error: { message: "db down" } });
    expect(await hasAnyBootstrapGrant()).toBe(false);
  });
});

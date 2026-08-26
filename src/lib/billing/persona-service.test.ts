import { beforeEach, describe, expect, it, vi } from "vitest";

// supabase-server.ts imports next/headers (cookies()), which doesn't
// resolve outside a real Next.js request — mocked the same way
// analytics/customer-analytics-service.test.ts already does.
const mockUser = { current: null as { id: string; email?: string } | null };
vi.mock("../supabase-server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser.current } })) },
  })),
}));

const getUserByIdMock = vi.fn();
const updateUserByIdMock = vi.fn();
vi.mock("../supabase/admin", () => ({
  supabaseAdmin: { auth: { admin: { getUserById: (...args: unknown[]) => getUserByIdMock(...args), updateUserById: (...args: unknown[]) => updateUserByIdMock(...args) } } },
}));

import {
  activateRecruiterPersona,
  AdminAccessRequiredError,
  getOptionalUserId,
  isAdmin,
  isRecruiter,
  PlatformUnauthorizedError,
  requirePlatformAdmin,
  requireUserId,
  resolveDefaultLandingPath,
  resolvePlatformRoles,
  setPlatformRoles,
} from "./persona-service";

// Phase 18 Milestone 1 — roles live in Supabase Auth's own app_metadata,
// never a new table (see this file's own header comment) — these tests
// mock only the Admin API calls that read/write it.

beforeEach(() => {
  getUserByIdMock.mockReset();
  updateUserByIdMock.mockReset();
  mockUser.current = null;
});

describe("resolvePlatformRoles", () => {
  it("defaults to JOB_SEEKER when app_metadata has no platform_roles at all", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null });
    expect(await resolvePlatformRoles("u1")).toEqual(["JOB_SEEKER"]);
  });

  it("returns the real roles array when present", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { platform_roles: ["RECRUITER", "ADMIN"] } } }, error: null });
    expect(await resolvePlatformRoles("u1")).toEqual(["RECRUITER", "ADMIN"]);
  });

  it("silently drops any value that isn't a real PlatformRole (never trusts arbitrary client-adjacent metadata content)", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { platform_roles: ["RECRUITER", "SUPER_ADMIN", 123, null] } } }, error: null });
    expect(await resolvePlatformRoles("u1")).toEqual(["RECRUITER"]);
  });

  it("falls back to JOB_SEEKER (never throws) on a lookup failure — e.g. an invalid/deleted userId", async () => {
    getUserByIdMock.mockResolvedValue({ data: null, error: { message: "not found" } });
    expect(await resolvePlatformRoles("nonexistent")).toEqual(["JOB_SEEKER"]);
  });

  it("falls back to JOB_SEEKER when platform_roles is present but empty (never an empty/no-persona user)", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { platform_roles: [] } } }, error: null });
    expect(await resolvePlatformRoles("u1")).toEqual(["JOB_SEEKER"]);
  });
});

describe("isAdmin / isRecruiter", () => {
  it("correctly identifies roles from an already-resolved list", () => {
    expect(isAdmin(["JOB_SEEKER", "ADMIN"])).toBe(true);
    expect(isAdmin(["JOB_SEEKER"])).toBe(false);
    expect(isRecruiter(["RECRUITER"])).toBe(true);
    expect(isRecruiter(["JOB_SEEKER"])).toBe(false);
  });
});

describe("setPlatformRoles", () => {
  it("writes roles via the service-role Admin API only — never a table a client route could reach", async () => {
    updateUserByIdMock.mockResolvedValue({ data: {}, error: null });
    await setPlatformRoles("u1", ["RECRUITER"]);
    expect(updateUserByIdMock).toHaveBeenCalledWith("u1", { app_metadata: { platform_roles: ["RECRUITER"] } });
  });

  it("throws when the Admin API call fails", async () => {
    updateUserByIdMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(setPlatformRoles("u1", ["ADMIN"])).rejects.toThrow("boom");
  });
});

describe("getOptionalUserId — the no-op-when-anonymous precedent (mirrors credit-service.ts's checkCredits())", () => {
  it("returns null when there is no Supabase session, never throwing", async () => {
    mockUser.current = null;
    expect(await getOptionalUserId()).toBeNull();
  });

  it("returns the real userId when a session exists", async () => {
    mockUser.current = { id: "u1" };
    expect(await getOptionalUserId()).toBe("u1");
  });
});

describe("requireUserId — Phase 18 M2/M3, a package-appropriate message (not resume-version-auth.ts's own hardcoded wording)", () => {
  it("throws PlatformUnauthorizedError, with a generic (not context-mismatched) message, when there is no session", async () => {
    mockUser.current = null;
    await expect(requireUserId()).rejects.toBeInstanceOf(PlatformUnauthorizedError);
    // Generic on purpose (M3 finding): this same error now fires for
    // both billing routes AND /admin/platform/* routes — a message
    // mentioning "billing" specifically would be wrong for the latter,
    // exactly the class of bug M2's own live-probing already caught once.
    await expect(requireUserId()).rejects.toThrow(/signed in/i);
  });

  it("returns the real userId and email from the session, never from anything client-supplied", async () => {
    mockUser.current = { id: "u1", email: "u1@example.com" };
    expect(await requireUserId()).toEqual({ userId: "u1", email: "u1@example.com" });
  });

  it("returns a null email when the session has none, never a fabricated placeholder", async () => {
    mockUser.current = { id: "u1" };
    expect(await requireUserId()).toEqual({ userId: "u1", email: null });
  });
});

describe("activateRecruiterPersona — Phase 23 Milestone 3, the one self-service role opt-in", () => {
  it("adds RECRUITER to an existing JOB_SEEKER-only account, additive not replacing", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { platform_roles: ["JOB_SEEKER"] } } }, error: null });
    updateUserByIdMock.mockResolvedValue({ data: {}, error: null });

    const roles = await activateRecruiterPersona("u1");

    expect(roles).toEqual(["JOB_SEEKER", "RECRUITER"]);
    expect(updateUserByIdMock).toHaveBeenCalledWith("u1", { app_metadata: { platform_roles: ["JOB_SEEKER", "RECRUITER"] } });
  });

  it("is idempotent — a caller who already holds RECRUITER gets the same roles back with no write", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { platform_roles: ["JOB_SEEKER", "RECRUITER"] } } }, error: null });

    const roles = await activateRecruiterPersona("u1");

    expect(roles).toEqual(["JOB_SEEKER", "RECRUITER"]);
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("never grants ADMIN or any role other than RECRUITER — the function accepts no role parameter at all", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { platform_roles: ["JOB_SEEKER"] } } }, error: null });
    updateUserByIdMock.mockResolvedValue({ data: {}, error: null });

    await activateRecruiterPersona("u1");

    const writtenRoles = updateUserByIdMock.mock.calls[0][1].app_metadata.platform_roles;
    expect(writtenRoles).not.toContain("ADMIN");
  });
});

describe("resolveDefaultLandingPath — Phase 23 Milestone 3 post-login routing", () => {
  it("routes a RECRUITER (even multi-role) to the Recruiter Workspace", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { platform_roles: ["JOB_SEEKER", "RECRUITER"] } } }, error: null });
    expect(await resolveDefaultLandingPath("u1")).toBe("/recruiter");
  });

  it("routes a plain JOB_SEEKER to the resume analyzer", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { platform_roles: ["JOB_SEEKER"] } } }, error: null });
    expect(await resolveDefaultLandingPath("u1")).toBe("/resume-analyzer");
  });

  it("routes an ADMIN-only account to the resume analyzer (no special-cased admin landing)", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { platform_roles: ["ADMIN"] } } }, error: null });
    expect(await resolveDefaultLandingPath("u1")).toBe("/resume-analyzer");
  });
});

describe("requirePlatformAdmin — Phase 18 M3, Scope H #1/#2 (the one gate every admin route/service function relies on)", () => {
  it("rejects with PlatformUnauthorizedError (401) when there's no session at all — never reaches the role check", async () => {
    mockUser.current = null;
    await expect(requirePlatformAdmin()).rejects.toBeInstanceOf(PlatformUnauthorizedError);
    expect(getUserByIdMock).not.toHaveBeenCalled();
  });

  it("rejects with AdminAccessRequiredError (403) for a real, authenticated NON-admin user", async () => {
    mockUser.current = { id: "u1" };
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { platform_roles: ["JOB_SEEKER", "RECRUITER"] } } }, error: null });

    await expect(requirePlatformAdmin()).rejects.toBeInstanceOf(AdminAccessRequiredError);
  });

  it("resolves for a real ADMIN, re-deriving the role from app_metadata on every call — never cached, never trusted from anywhere else", async () => {
    mockUser.current = { id: "admin1", email: "admin@example.com" };
    getUserByIdMock.mockResolvedValue({ data: { user: { app_metadata: { platform_roles: ["ADMIN"] } } }, error: null });

    await expect(requirePlatformAdmin()).resolves.toEqual({ userId: "admin1", email: "admin@example.com" });
    expect(getUserByIdMock).toHaveBeenCalledWith("admin1");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// supabase-server.ts imports next/headers (cookies()), which doesn't
// resolve outside a real Next.js request — mocked the same way
// analytics/customer-analytics-service.test.ts already does.
const mockUser = { current: null as { id: string } | null };
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

import { getOptionalUserId, isAdmin, isRecruiter, resolvePlatformRoles, setPlatformRoles } from "./persona-service";

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

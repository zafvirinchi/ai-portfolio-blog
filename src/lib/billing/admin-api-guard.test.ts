import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 18 Milestone 4, Step 7/10 — this file is the shared guard every
// previously-unprotected /api/admin/** route (blogs, interview-*,
// knowledge, rag-documents) and every route that used to have its own
// weak session-only requireAdmin() (analytics/*) now calls. Mirrors
// persona-service.test.ts's own mocking convention for the same reason:
// persona-service.ts transitively imports supabase-server.ts (next/headers),
// which doesn't resolve outside a real Next.js request.
const requirePlatformAdminMock = vi.fn();
const { FakePlatformUnauthorizedError, FakeAdminAccessRequiredError } = vi.hoisted(() => ({
  FakePlatformUnauthorizedError: class extends Error {},
  FakeAdminAccessRequiredError: class extends Error {},
}));
vi.mock("./persona-service", () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdminMock(...args),
  PlatformUnauthorizedError: FakePlatformUnauthorizedError,
  AdminAccessRequiredError: FakeAdminAccessRequiredError,
}));

import { requireAdminRoute } from "./admin-api-guard";

beforeEach(() => {
  requirePlatformAdminMock.mockReset();
});

describe("requireAdminRoute — #1/#2/#3, the gate every formerly-unprotected /api/admin/** route now uses", () => {
  it("returns ok:true with the resolved admin identity for a real ADMIN — #3", async () => {
    requirePlatformAdminMock.mockResolvedValue({ userId: "admin1", email: "admin@example.com" });

    const result = await requireAdminRoute();

    expect(result).toEqual({ ok: true, userId: "admin1", email: "admin@example.com" });
  });

  it("maps no-session to 401 — #1", async () => {
    requirePlatformAdminMock.mockRejectedValue(new FakePlatformUnauthorizedError("no session"));

    const result = await requireAdminRoute();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("maps an authenticated non-admin to 403 — #2", async () => {
    requirePlatformAdminMock.mockRejectedValue(new FakeAdminAccessRequiredError("not admin"));

    const result = await requireAdminRoute();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("never accepts any caller-supplied input at all — there is no parameter to forge an isAdmin/role claim through (#14/#15 structurally, not just by check)", () => {
    expect(requireAdminRoute.length).toBe(0);
  });

  it("maps an unexpected failure to 500 without leaking the underlying error message", async () => {
    requirePlatformAdminMock.mockRejectedValue(new Error("supabase connection reset unexpectedly"));

    const result = await requireAdminRoute();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(500);
      const body = await result.response.json();
      expect(body.error).not.toMatch(/supabase connection reset/);
    }
  });
});

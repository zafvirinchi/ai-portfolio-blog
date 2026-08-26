import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for the Phase 23 Milestone 3 fix: there was no
// self-service way to ever acquire the RECRUITER platform role — every
// recruiter.* requireFeature() check rejected a JOB_SEEKER-only account
// with no path out. This route is the one, deliberately narrow fix:
// userId is always the caller's own session, and the role granted is
// hardcoded server-side to RECRUITER only.

const { FakePlatformUnauthorizedError } = vi.hoisted(() => ({
  FakePlatformUnauthorizedError: class extends Error {},
}));

const requireUserIdMock = vi.fn();
const activateRecruiterPersonaMock = vi.fn();
vi.mock("@/lib/billing/persona-service", () => ({
  requireUserId: (...args: unknown[]) => requireUserIdMock(...args),
  activateRecruiterPersona: (...args: unknown[]) => activateRecruiterPersonaMock(...args),
  PlatformUnauthorizedError: FakePlatformUnauthorizedError,
}));

import { POST } from "./route";

beforeEach(() => {
  requireUserIdMock.mockReset();
  activateRecruiterPersonaMock.mockReset();
});

describe("POST /api/persona/recruiter/activate", () => {
  it("rejects with 401 when there is no session", async () => {
    requireUserIdMock.mockRejectedValue(new FakePlatformUnauthorizedError("You must be signed in to access this."));

    const response = await POST();

    expect(response.status).toBe(401);
    expect(activateRecruiterPersonaMock).not.toHaveBeenCalled();
  });

  it("activates RECRUITER for the caller's own session id only, never a client-supplied id", async () => {
    requireUserIdMock.mockResolvedValue({ userId: "u1", email: "u1@example.com" });
    activateRecruiterPersonaMock.mockResolvedValue(["JOB_SEEKER", "RECRUITER"]);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(activateRecruiterPersonaMock).toHaveBeenCalledWith("u1");
    expect(body).toEqual({ roles: ["JOB_SEEKER", "RECRUITER"] });
  });

  it("returns a safe 422 (no internal detail leaked) when activation fails unexpectedly", async () => {
    requireUserIdMock.mockResolvedValue({ userId: "u1", email: null });
    activateRecruiterPersonaMock.mockRejectedValue(new Error("Supabase Admin API is down"));

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).not.toContain("Supabase");
  });
});

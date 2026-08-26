import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for the most severe defect found in this pass:
// checkLoginLockout() is called as the FIRST step of every login attempt
// (auth-service.ts's login()), before Supabase's own signInWithPassword()
// ever runs. It used to throw unconditionally on any Supabase error,
// which meant EVERY login attempt (not just registration/OAuth) crashed
// outright whenever security_events didn't exist — reproduced live
// against this repository's actual, currently-unmigrated Supabase
// project. Fixed to fail open (report "not locked") instead, matching
// recordLoginAttempt()'s own already-correct sibling behavior.

const selectMock = vi.fn();
vi.mock("../supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: (...args: unknown[]) => selectMock(...args),
    }),
  },
}));

import { checkLoginLockout } from "./security-service";

beforeEach(() => {
  selectMock.mockReset();
});

function chainable(result: { count: number | null; error: unknown }) {
  const builder = {
    eq: () => builder,
    gte: () => Promise.resolve(result),
  };
  return builder;
}

describe("checkLoginLockout — fails open when security_events is unavailable", () => {
  it("PROVES it reports 'not locked' instead of throwing when the table doesn't exist", async () => {
    selectMock.mockReturnValue(
      chainable({ count: null, error: { code: "PGRST205", message: "Could not find the table 'public.security_events' in the schema cache" } })
    );

    const result = await checkLoginLockout("user@example.com");

    expect(result.locked).toBe(false);
    expect(result.failedAttempts).toBe(0);
  });

  it("still correctly reports locked when the real count is at/above the limit", async () => {
    selectMock.mockReturnValue(chainable({ count: 10, error: null }));

    const result = await checkLoginLockout("user@example.com");

    expect(result.locked).toBe(true);
    expect(result.failedAttempts).toBe(10);
  });

  it("still correctly reports not locked when under the limit", async () => {
    selectMock.mockReturnValue(chainable({ count: 1, error: null }));

    const result = await checkLoginLockout("user@example.com");

    expect(result.locked).toBe(false);
  });
});

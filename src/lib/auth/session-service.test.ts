import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for a genuine, live-reproduced defect: record() used to
// throw unconditionally on any Supabase error, unlike its own sibling
// touch()/list() (and security-service.ts's detectSuspiciousLogin()/
// audit-auth.ts's record() in the same finalizeLogin() call chain), which
// all already fail open. This meant login (both password and OAuth, via
// auth-service.ts's finalizeLogin()) hard-crashed with a 500 whenever
// auth_sessions didn't exist yet — reproduced live against this
// repository's actual, currently-unmigrated Supabase project. Fixed to
// return null (logging the failure) instead of throwing, matching the
// established pattern; every real caller of the AUTH_SESSION_COOKIE_NAME
// cookie already treats a missing session id as a normal `?? null` case.

const insertMock = vi.fn();
vi.mock("../supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (...args: unknown[]) => insertMock(...args),
    }),
  },
}));

import { record } from "./session-service";

beforeEach(() => {
  insertMock.mockReset();
});

describe("record — fails open when auth_sessions is unavailable", () => {
  it("PROVES record() returns null instead of throwing when the table doesn't exist", async () => {
    insertMock.mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { code: "PGRST205", message: "Could not find the table 'public.auth_sessions' in the schema cache" },
          }),
      }),
    });

    const result = await record("u1", "1.2.3.4", "test-agent");

    expect(result).toBeNull();
  });

  it("still returns a real session on success, unchanged behavior", async () => {
    const row = { id: "s1", user_id: "u1", ip_address: "1.2.3.4", user_agent: "test-agent", created_at: "2026-01-01", last_seen_at: "2026-01-01", revoked_at: null };
    insertMock.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: row, error: null }),
      }),
    });

    const result = await record("u1", "1.2.3.4", "test-agent");

    expect(result).toEqual({ ...row, is_current: true });
  });
});

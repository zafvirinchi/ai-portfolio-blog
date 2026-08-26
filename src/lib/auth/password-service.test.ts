import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for the defect the user actually hit: recordPasswordChange()
// (called by auth-service.ts's register() right after a real Supabase
// signUp() already succeeded) used to throw unconditionally whenever
// password_history didn't exist, crashing registration entirely even
// though the real account had already been created. checkHistory() had
// the identical bug on the password-change/reset-password paths. Both
// fixed to fail open on a lookup/write failure; checkHistory() still
// correctly throws on a genuine password-reuse match.

const insertMock = vi.fn();
const selectMock = vi.fn();
vi.mock("../supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (...args: unknown[]) => insertMock(...args),
      select: (...args: unknown[]) => selectMock(...args),
    }),
  },
}));

import { checkHistory, recordPasswordChange } from "./password-service";

beforeEach(() => {
  insertMock.mockReset().mockResolvedValue({ error: null });
  selectMock.mockReset();
});

describe("recordPasswordChange — fails open when password_history is unavailable", () => {
  it("PROVES it does not throw when the table doesn't exist", async () => {
    insertMock.mockResolvedValue({ error: { code: "PGRST205", message: "Could not find the table 'public.password_history' in the schema cache" } });

    await expect(recordPasswordChange("u1", "NewPassword123!")).resolves.toBeUndefined();
  });
});

describe("checkHistory — fails open on lookup failure, still enforces genuine reuse", () => {
  it("PROVES it does not throw when the table doesn't exist — skips the reuse check", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: null, error: { code: "PGRST205", message: "table not found" } }),
        }),
      }),
    });

    await expect(checkHistory("u1", "NewPassword123!")).resolves.toBeUndefined();
  });
});

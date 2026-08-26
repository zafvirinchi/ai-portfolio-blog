import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 24 Milestone 2 — regression test for the fix: this route used
// to console.log a submission and always return {success: true}, so a
// real persistence failure was invisible to the caller and the message
// was lost forever. Fixed to persist via supabaseAdmin and fail closed
// (an honest error) when the write fails — this is a primary action,
// not secondary bookkeeping, so there is no already-succeeded action to
// preserve by failing open.

const insertMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({ insert: (...args: unknown[]) => insertMock(...args) }),
  },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("https://example.com/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  insertMock.mockReset();
});

describe("POST /api/contact", () => {
  it("rejects a request missing a required field before ever touching the database", async () => {
    const response = await POST(req({ name: "A", email: "a@example.com" }));

    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("persists the message via supabaseAdmin and returns success", async () => {
    insertMock.mockResolvedValue({ error: null });

    const response = await POST(req({ name: "Alice", email: "alice@example.com", message: "Hello" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(insertMock).toHaveBeenCalledWith({ name: "Alice", email: "alice@example.com", message: "Hello" });
  });

  it("PROVES a persistence failure is reported to the caller, never silently swallowed as success", async () => {
    insertMock.mockResolvedValue({ error: { code: "PGRST205", message: "Could not find the table 'public.contact_messages' in the schema cache" } });

    const response = await POST(req({ name: "Alice", email: "alice@example.com", message: "Hello" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBeUndefined();
    expect(body.error).toBeTruthy();
  });
});

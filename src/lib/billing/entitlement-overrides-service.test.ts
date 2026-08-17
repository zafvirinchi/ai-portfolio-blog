import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntitlementOverride } from "./entitlement-overrides-service";

// Phase 18 Milestone 3, Scope H #11 — "expired overrides do not grant
// access", tested against a real (if minimal) filter-applying fake of
// listActiveOverrides()'s own actual Supabase query
// (.eq("user_id",...).is("revoked_at", null).or("expires_at.is.null,expires_at.gt.<iso>"))
// rather than mocking the function itself — this is the one place in
// this milestone's test suite that exercises the ACTUAL query-filter
// logic, not a stand-in for it.

let rows: EntitlementOverride[] = [];

function makeFakeSupabaseAdmin() {
  return {
    from: () => {
      let filtered = [...rows];

      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filtered = filtered.filter((row) => (row as unknown as Record<string, unknown>)[column] === value);
          return builder;
        },
        is: (column: string, value: null) => {
          filtered = filtered.filter((row) => (row as unknown as Record<string, unknown>)[column] === value);
          return builder;
        },
        // Parses exactly the one shape listActiveOverrides() itself
        // produces: "expires_at.is.null,expires_at.gt.<iso>".
        or: (expression: string) => {
          const nowIso = expression.match(/expires_at\.gt\.(.+)$/)?.[1];
          filtered = filtered.filter((row) => row.expires_at === null || (nowIso !== undefined && row.expires_at !== null && row.expires_at > nowIso));
          return builder;
        },
        order: () => builder,
        maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
        then: (resolve: (v: { data: EntitlementOverride[]; error: null }) => unknown) => Promise.resolve({ data: filtered, error: null }).then(resolve),
      };

      return builder;
    },
  };
}

vi.mock("../supabase/admin", () => ({
  get supabaseAdmin() {
    return makeFakeSupabaseAdmin();
  },
}));

import { getOverrideById, listActiveOverrides, listAllOverridesForUser } from "./entitlement-overrides-service";

function makeOverride(overrides: Partial<EntitlementOverride> = {}): EntitlementOverride {
  return {
    id: "o1",
    user_id: "u1",
    feature_id: "resume.optimize",
    access: "GRANTED",
    reason: null,
    granted_by: "admin1",
    expires_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    revoked_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  rows = [];
});

describe("listActiveOverrides — Step H #11, expired overrides never grant access", () => {
  it("includes a permanent (expires_at: null) override", async () => {
    rows = [makeOverride({ expires_at: null })];
    const result = await listActiveOverrides("u1");
    expect(result).toHaveLength(1);
  });

  it("includes an override that expires in the future", async () => {
    rows = [makeOverride({ expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })];
    const result = await listActiveOverrides("u1");
    expect(result).toHaveLength(1);
  });

  it("EXCLUDES an override that has already expired", async () => {
    rows = [makeOverride({ expires_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() })];
    const result = await listActiveOverrides("u1");
    expect(result).toHaveLength(0);
  });

  it("EXCLUDES a manually revoked override even if it hasn't expired", async () => {
    rows = [makeOverride({ expires_at: null, revoked_at: new Date().toISOString() })];
    const result = await listActiveOverrides("u1");
    expect(result).toHaveLength(0);
  });

  it("never returns another user's overrides", async () => {
    rows = [makeOverride({ user_id: "other-user" })];
    const result = await listActiveOverrides("u1");
    expect(result).toHaveLength(0);
  });
});

describe("listAllOverridesForUser — full history, including inactive rows", () => {
  it("includes expired and revoked rows too, unlike listActiveOverrides()", async () => {
    rows = [makeOverride({ id: "expired", expires_at: new Date(Date.now() - 1000).toISOString() }), makeOverride({ id: "revoked", revoked_at: new Date().toISOString() })];
    const result = await listAllOverridesForUser("u1");
    expect(result.map((r) => r.id).sort()).toEqual(["expired", "revoked"]);
  });
});

describe("getOverrideById", () => {
  it("returns the matching override", async () => {
    rows = [makeOverride({ id: "target" })];
    const result = await getOverrideById("target");
    expect(result?.id).toBe("target");
  });

  it("returns null for an unknown id, never throwing", async () => {
    rows = [];
    expect(await getOverrideById("nonexistent")).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 21 Milestone 2 — first tests for this file. Mirrors platform-
// subscription-service.test.ts's own hand-rolled fake Supabase query
// builder pattern exactly (this file's own out-of-order guard, added
// this milestone, is a direct port of that file's upsertSubscription()
// out-of-order guard) — extended with a minimal update()/eq() pair for
// cancel()/resume()/markCanceled().

let rows: Record<string, unknown>[] = [];

function makeFakeSupabaseAdmin() {
  return {
    from: (table: string) => {
      // Only "subscriptions" rows are ever seeded by these tests;
      // getPlanByKey()'s incidental "plans" table reads correctly see no
      // rows and fall back to the static plan catalog, matching
      // plan-service.ts's own documented graceful-degradation behavior.
      let filtered = table === "subscriptions" ? [...rows] : [];

      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filtered = filtered.filter((row) => row[column] === value);
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
        order: () => builder,
        then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) => Promise.resolve({ data: filtered, error: null }).then(resolve),
        upsert: (payload: Record<string, unknown>, options: { onConflict: string }) => {
          const conflictColumn = options.onConflict;
          const existingIndex = rows.findIndex((row) => row[conflictColumn] === payload[conflictColumn]);
          const row = { id: `row-${rows.length + 1}`, created_at: new Date().toISOString(), ...(existingIndex >= 0 ? rows[existingIndex] : {}), ...payload };

          if (existingIndex >= 0) rows[existingIndex] = row;
          else rows.push(row);

          return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) };
        },
        update: (payload: Record<string, unknown>) => {
          let updateFiltered = [...rows];
          const updateBuilder = {
            eq: (column: string, value: unknown) => {
              updateFiltered = updateFiltered.filter((row) => row[column] === value);
              const idx = rows.findIndex((row) => row === updateFiltered[0]);
              if (idx >= 0) rows[idx] = { ...rows[idx], ...payload };
              return {
                select: () => ({ single: () => Promise.resolve({ data: rows[idx], error: null }) }),
                then: (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
              };
            },
          };
          return updateBuilder;
        },
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

import { getActiveSubscription, markCanceled, upsertFromProvider } from "./subscription-service";

const baseInput = {
  organizationId: "org1",
  planKey: "professional" as const,
  billingInterval: "monthly" as const,
  provider: "stripe",
  providerCustomerId: "cus_1",
  providerSubscriptionId: "sub_1",
  currentPeriodEnd: null,
};

beforeEach(() => {
  rows = [];
});

describe("upsertFromProvider — idempotent replay", () => {
  it("a replayed event for the same organization re-writes the same row, not a second one", async () => {
    await upsertFromProvider({ ...baseInput, status: "active", eventCreatedAt: "2026-01-01T00:00:00.000Z" });
    await upsertFromProvider({ ...baseInput, status: "past_due", eventCreatedAt: "2026-01-01T00:05:00.000Z" });

    const stored = await getActiveSubscription("org1");
    expect(stored.isImplicitFree).toBe(false);
    expect(stored.status).toBe("past_due");
    expect(rows).toHaveLength(1);
  });
});

describe("upsertFromProvider — Phase 21 Milestone 2 out-of-order webhook delivery guard", () => {
  it("a genuinely newer event overwrites an older one (the common, in-order case)", async () => {
    await upsertFromProvider({ ...baseInput, status: "past_due", eventCreatedAt: "2026-01-01T00:00:00.000Z" });
    await upsertFromProvider({ ...baseInput, status: "active", eventCreatedAt: "2026-01-01T00:05:00.000Z" });

    const stored = await getActiveSubscription("org1");
    expect(stored.status).toBe("active");
  });

  it("a DELAYED, older event arriving after a newer one is ignored — never reverts already-newer state", async () => {
    await upsertFromProvider({ ...baseInput, status: "active", eventCreatedAt: "2026-01-01T00:05:00.000Z" });
    // Simulates Stripe delivering an earlier-generated event late (e.g. a
    // retried past_due notification that predates a renewal that already
    // landed) — must not un-do the newer "active" state.
    const result = await upsertFromProvider({ ...baseInput, status: "past_due", eventCreatedAt: "2026-01-01T00:00:00.000Z" });

    expect(result.status).toBe("active");
    const stored = await getActiveSubscription("org1");
    expect(stored.status).toBe("active");
    expect(rows).toHaveLength(1);
  });

  it("an event with the exact same timestamp as the stored row is treated as a duplicate, not applied again", async () => {
    await upsertFromProvider({ ...baseInput, status: "active", eventCreatedAt: "2026-01-01T00:05:00.000Z" });
    const result = await upsertFromProvider({ ...baseInput, status: "past_due", eventCreatedAt: "2026-01-01T00:05:00.000Z" });

    expect(result.status).toBe("active");
  });

  it("the first event for a brand-new organization is always applied — nothing to compare against yet", async () => {
    const result = await upsertFromProvider({ ...baseInput, status: "active", eventCreatedAt: "2026-01-01T00:00:00.000Z" });
    expect(result.status).toBe("active");
  });

  it("unrelated organizations remain isolated — a stale event for org1 never touches org2's row", async () => {
    await upsertFromProvider({ ...baseInput, organizationId: "org2", status: "active", eventCreatedAt: "2026-01-01T00:05:00.000Z" });
    await upsertFromProvider({ ...baseInput, organizationId: "org1", status: "active", eventCreatedAt: "2026-01-01T00:00:00.000Z" });

    const org2 = await getActiveSubscription("org2");
    expect(org2.status).toBe("active");
    expect(rows).toHaveLength(2);
  });
});

describe("markCanceled — Phase 21 Milestone 2 out-of-order webhook delivery guard", () => {
  it("cancels a subscription with no newer competing event", async () => {
    await upsertFromProvider({ ...baseInput, status: "active", eventCreatedAt: "2026-01-01T00:00:00.000Z" });
    await markCanceled("org1", "2026-01-01T00:05:00.000Z");

    const stored = await getActiveSubscription("org1");
    expect(stored.status).toBe("canceled");
  });

  it("a DELAYED subscription.deleted event arriving after a newer reactivation is ignored — never cancels an already-newer active state", async () => {
    await upsertFromProvider({ ...baseInput, status: "active", eventCreatedAt: "2026-01-01T00:00:00.000Z" });
    // A later re-subscribe/reactivation already landed...
    await upsertFromProvider({ ...baseInput, status: "active", eventCreatedAt: "2026-01-01T00:10:00.000Z" });
    // ...then a stale deletion event for the OLD subscription arrives late.
    await markCanceled("org1", "2026-01-01T00:05:00.000Z");

    const stored = await getActiveSubscription("org1");
    expect(stored.status).toBe("active");
  });
});

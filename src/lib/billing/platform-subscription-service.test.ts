import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformSubscriptionRow } from "./platform-subscription-service";

// Phase 18 Milestone 2 — a minimal, hand-rolled fake Supabase query
// builder (not analytics/test-helpers.ts's makeQueryBuilder, which that
// package's own header comment scopes to its own tests only) supporting
// exactly what this file's upsert-by-unique-key/select-by-column calls
// need: select().eq().maybeSingle(), select().eq() (awaited directly),
// and upsert(...).select().single().

let rows: Record<string, unknown>[] = [];

function makeFakeSupabaseAdmin() {
  return {
    from: () => {
      let filtered = [...rows];
      const filters: { column: string; value: unknown }[] = [];

      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push({ column, value });
          filtered = filtered.filter((row) => row[column] === value);
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
        then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) => Promise.resolve({ data: filtered, error: null }).then(resolve),
        upsert: (payload: Record<string, unknown>, options: { onConflict: string }) => {
          const conflictColumn = options.onConflict;
          const existingIndex = rows.findIndex((row) => row[conflictColumn] === payload[conflictColumn]);
          const row = { id: `row-${rows.length + 1}`, created_at: new Date().toISOString(), ...(existingIndex >= 0 ? rows[existingIndex] : {}), ...payload };

          if (existingIndex >= 0) rows[existingIndex] = row;
          else rows.push(row);

          return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) };
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

import { isPaidAccessStatus, listSubscriptionsForUser, pickBestSubscriptionForRole, upsertSubscription } from "./platform-subscription-service";

function makeRow(overrides: Partial<PlatformSubscriptionRow> = {}): PlatformSubscriptionRow {
  return {
    id: "s1",
    user_id: "u1",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    stripe_price_id: "price_1",
    plan_id: "JOB_SEEKER_PRO",
    status: "active",
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  rows = [];
});

describe("isPaidAccessStatus — Step 11 deterministic status policy", () => {
  it("grants paid access for active/trialing/past_due", () => {
    expect(isPaidAccessStatus("active")).toBe(true);
    expect(isPaidAccessStatus("trialing")).toBe(true);
    expect(isPaidAccessStatus("past_due")).toBe(true);
  });

  it("never grants paid access for canceled/unpaid/incomplete/incomplete_expired", () => {
    expect(isPaidAccessStatus("canceled")).toBe(false);
    expect(isPaidAccessStatus("unpaid")).toBe(false);
    expect(isPaidAccessStatus("incomplete")).toBe(false);
    expect(isPaidAccessStatus("incomplete_expired")).toBe(false);
  });
});

describe("pickBestSubscriptionForRole", () => {
  it("returns null for ADMIN — no plan family exists for it", () => {
    expect(pickBestSubscriptionForRole([makeRow()], "ADMIN")).toBeNull();
  });

  it("returns null when no row exists in the role's plan family", () => {
    expect(pickBestSubscriptionForRole([makeRow({ plan_id: "RECRUITER_PRO" })], "JOB_SEEKER")).toBeNull();
  });

  it("never returns a canceled row even if it's the only one — a stale local row never retains paid access (Step 11)", () => {
    expect(pickBestSubscriptionForRole([makeRow({ status: "canceled" })], "JOB_SEEKER")).toBeNull();
  });

  it("picks the most recently updated row when two paid-access rows exist in the same family", () => {
    const older = makeRow({ id: "old", updated_at: "2026-01-01T00:00:00.000Z" });
    const newer = makeRow({ id: "new", updated_at: "2026-06-01T00:00:00.000Z" });
    expect(pickBestSubscriptionForRole([older, newer], "JOB_SEEKER")?.id).toBe("new");
  });

  it("never crosses plan families — a Recruiter row is invisible when resolving Job Seeker", () => {
    const recruiterRow = makeRow({ plan_id: "RECRUITER_BUSINESS" });
    expect(pickBestSubscriptionForRole([recruiterRow], "JOB_SEEKER")).toBeNull();
  });
});

describe("upsertSubscription — Step 9 idempotency", () => {
  it("replaying the same stripe_subscription_id re-writes the same row rather than creating a duplicate", async () => {
    const input = {
      userId: "u1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_idempotent",
      stripePriceId: "price_1",
      planId: "JOB_SEEKER_PRO" as const,
      status: "active" as const,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      eventCreatedAt: "2026-01-01T00:00:00.000Z",
    };

    await upsertSubscription(input);
    await upsertSubscription({ ...input, status: "past_due", eventCreatedAt: "2026-01-01T00:05:00.000Z" });

    const stored = await listSubscriptionsForUser("u1");
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe("past_due");
  });
});

describe("upsertSubscription — Phase 18 Milestone 6, out-of-order webhook delivery guard", () => {
  const baseInput = {
    userId: "u1",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_ordering",
    stripePriceId: "price_1",
    planId: "JOB_SEEKER_PRO" as const,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  };

  it("a genuinely newer event overwrites an older one (the common, in-order case)", async () => {
    await upsertSubscription({ ...baseInput, status: "past_due", eventCreatedAt: "2026-01-01T00:00:00.000Z" });
    await upsertSubscription({ ...baseInput, status: "active", eventCreatedAt: "2026-01-01T00:05:00.000Z" });

    const stored = await listSubscriptionsForUser("u1");
    expect(stored[0].status).toBe("active");
  });

  it("a DELAYED, older event arriving after a newer one is ignored — never reverts already-newer state", async () => {
    await upsertSubscription({ ...baseInput, status: "active", eventCreatedAt: "2026-01-01T00:05:00.000Z" });
    // Simulates Stripe delivering an earlier-generated event late (e.g. a
    // retried past_due notification that predates a renewal that already
    // landed) — must not un-do the newer "active" state.
    const result = await upsertSubscription({ ...baseInput, status: "past_due", eventCreatedAt: "2026-01-01T00:00:00.000Z" });

    expect(result.status).toBe("active");
    const stored = await listSubscriptionsForUser("u1");
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe("active");
  });

  it("an event with the exact same timestamp as the stored row is treated as a duplicate, not applied again", async () => {
    await upsertSubscription({ ...baseInput, status: "active", eventCreatedAt: "2026-01-01T00:05:00.000Z" });
    const result = await upsertSubscription({ ...baseInput, status: "canceled", eventCreatedAt: "2026-01-01T00:05:00.000Z" });

    expect(result.status).toBe("active");
  });

  it("the first event for a brand-new subscription is always applied — nothing to compare against yet", async () => {
    const result = await upsertSubscription({ ...baseInput, status: "trialing", eventCreatedAt: "2026-01-01T00:00:00.000Z" });
    expect(result.status).toBe("trialing");
  });
});

describe("listSubscriptionsForUser — fail-closed on query failure", () => {
  it("returns an empty list (never throws) when the underlying query errors", async () => {
    vi.doMock("../supabase/admin", () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: null, error: { message: "table not found" } }) }) }) },
    }));

    vi.resetModules();
    const { listSubscriptionsForUser: freshListSubscriptionsForUser } = await import("./platform-subscription-service");
    await expect(freshListSubscriptionsForUser("u1")).resolves.toEqual([]);
  });
});

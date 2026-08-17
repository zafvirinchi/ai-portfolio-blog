import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 21 Milestone 2 — first tests for this file. Regression coverage
// for the payment-delivery-correctness defect this milestone fixed: a
// genuine Stripe webhook redelivery (checkout.session.completed /
// invoice.paid / invoice.payment_failed) previously created a second
// `payments` row for the same real-world payment (see record()'s own
// Phase 21 M2 comment for the full defect + fix rationale).

let rows: Record<string, unknown>[] = [];

function makeFakeSupabaseAdmin() {
  return {
    from: () => {
      let filtered = [...rows];

      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filtered = filtered.filter((row) => row[column] === value);
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
        insert: (payload: Record<string, unknown>) => {
          const row = { id: `row-${rows.length + 1}`, created_at: new Date().toISOString(), ...payload };
          rows.push(row);
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

import { record } from "./payment-service";

const baseInput = {
  organizationId: "org1",
  subscriptionId: "sub-row-1",
  provider: "stripe" as const,
  amountCents: 1900,
  currency: "usd",
  status: "succeeded" as const,
};

beforeEach(() => {
  rows = [];
});

describe("record — Phase 21 Milestone 2 duplicate-delivery idempotency", () => {
  it("records a genuinely new payment", async () => {
    const result = await record({ ...baseInput, providerPaymentId: "pi_123" });

    expect(result).not.toBeNull();
    expect(rows).toHaveLength(1);
  });

  it("PROVES a redelivered webhook for the same provider_payment_id does not create a second row", async () => {
    await record({ ...baseInput, providerPaymentId: "pi_123" });
    const second = await record({ ...baseInput, providerPaymentId: "pi_123" });

    expect(second).toBeNull();
    expect(rows).toHaveLength(1);
  });

  it("a different payment (different provider_payment_id) for the same organization is recorded normally", async () => {
    await record({ ...baseInput, providerPaymentId: "pi_123" });
    const second = await record({ ...baseInput, providerPaymentId: "pi_456" });

    expect(second).not.toBeNull();
    expect(rows).toHaveLength(2);
  });

  it("the same provider_payment_id for a DIFFERENT organization is not treated as a duplicate — dedup is scoped per organization", async () => {
    await record({ ...baseInput, organizationId: "org1", providerPaymentId: "pi_123" });
    const second = await record({ ...baseInput, organizationId: "org2", providerPaymentId: "pi_123" });

    expect(second).not.toBeNull();
    expect(rows).toHaveLength(2);
  });

  it("a null providerPaymentId (defensive fallback case) is never deduped against — always recorded", async () => {
    await record({ ...baseInput, providerPaymentId: null });
    const second = await record({ ...baseInput, providerPaymentId: null });

    expect(second).not.toBeNull();
    expect(rows).toHaveLength(2);
  });

  it("fails OPEN on the dedup lookup itself — a lookup error still records the (potentially new) payment rather than silently dropping it", async () => {
    const failingAdmin = {
      from: () => ({
        select: () => ({
          eq: function (this: unknown) {
            return this;
          },
          maybeSingle: () => Promise.resolve({ data: null, error: { message: "connection refused" } }),
        }),
        insert: (payload: Record<string, unknown>) => {
          const row = { id: "row-1", created_at: new Date().toISOString(), ...payload };
          rows.push(row);
          return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) };
        },
      }),
    };
    vi.doMock("../supabase/admin", () => ({ supabaseAdmin: failingAdmin }));
    vi.resetModules();
    const { record: recordWithFailingLookup } = await import("./payment-service");

    const result = await recordWithFailingLookup({ ...baseInput, providerPaymentId: "pi_123" });

    expect(result).not.toBeNull();
    expect(rows).toHaveLength(1);
  });
});

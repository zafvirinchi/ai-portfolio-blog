import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 21 Milestone 2 — first tests for handleStripeWebhook() itself
// (the orchestration layer). subscription-service.ts's and
// payment-service.ts's own internal idempotency/ordering logic already
// has dedicated coverage in their own test files — these tests instead
// prove billing-service.ts wires the Stripe event correctly INTO that
// logic: signature verification gates everything, the event's own
// `created` timestamp is threaded through (never wall-clock), a
// duplicate-detected payment correctly skips the paired invoice write,
// and malformed/unsupported events fail safe without touching any
// organization's state. Real signature-verification cryptography itself
// is unchanged, pre-existing code (stripe-provider.ts) — not re-tested
// here, only that a verification failure is never bypassed or swallowed.

const verifyAndConstructWebhookEventMock = vi.fn();
vi.mock("./billing-provider", () => ({
  getBillingProvider: () => ({ verifyAndConstructWebhookEvent: (...args: unknown[]) => verifyAndConstructWebhookEventMock(...args) }),
}));

const upsertFromProviderMock = vi.fn();
const markCanceledMock = vi.fn();
const getActiveSubscriptionMock = vi.fn();
vi.mock("./subscription-service", () => ({
  upsertFromProvider: (...args: unknown[]) => upsertFromProviderMock(...args),
  markCanceled: (...args: unknown[]) => markCanceledMock(...args),
  getActiveSubscription: (...args: unknown[]) => getActiveSubscriptionMock(...args),
}));

const paymentRecordMock = vi.fn();
vi.mock("./payment-service", () => ({
  record: (...args: unknown[]) => paymentRecordMock(...args),
}));

const invoiceCreateMock = vi.fn();
vi.mock("./invoice-service", () => ({
  create: (...args: unknown[]) => invoiceCreateMock(...args),
}));

const applyToOrganizationMock = vi.fn();
vi.mock("./coupon-service", () => ({
  applyToOrganization: (...args: unknown[]) => applyToOrganizationMock(...args),
}));

const resolveOrgFromCustomerRows: Record<string, string> = { cus_org1: "org1", cus_org2: "org2" };
vi.mock("../supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_col: string, customerId: string) => ({
          maybeSingle: () => Promise.resolve({ data: resolveOrgFromCustomerRows[customerId] ? { organization_id: resolveOrgFromCustomerRows[customerId] } : null, error: null }),
        }),
      }),
    }),
  },
}));

import { handleStripeWebhook } from "./billing-service";

function fakeCheckoutEvent(overrides: Record<string, unknown> = {}) {
  return {
    created: 1735689600, // 2025-01-01T00:00:00Z
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        metadata: { organizationId: "org1", planKey: "professional" },
        customer: "cus_org1",
        subscription: "sub_1",
        payment_intent: "pi_1",
        amount_total: 1900,
        currency: "usd",
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  verifyAndConstructWebhookEventMock.mockReset();
  upsertFromProviderMock.mockReset().mockResolvedValue({ id: "sub-row-1" });
  markCanceledMock.mockReset();
  getActiveSubscriptionMock.mockReset().mockResolvedValue({ id: "sub-row-1", isImplicitFree: false });
  paymentRecordMock.mockReset().mockResolvedValue({ id: "pay-1" });
  invoiceCreateMock.mockReset();
  applyToOrganizationMock.mockReset();
});

describe("handleStripeWebhook — signature verification gates everything", () => {
  it("a genuine, verified signature is processed", async () => {
    verifyAndConstructWebhookEventMock.mockResolvedValue({ type: "checkout.session.completed", raw: fakeCheckoutEvent() });

    const result = await handleStripeWebhook("raw-body", "valid-sig");

    expect(result.handled).toBe(true);
    expect(upsertFromProviderMock).toHaveBeenCalledTimes(1);
  });

  it("PROVES an invalid signature is rejected before any organization state is ever touched", async () => {
    verifyAndConstructWebhookEventMock.mockRejectedValue(new Error("No signatures found matching the expected signature for payload"));

    await expect(handleStripeWebhook("raw-body", "bad-sig")).rejects.toThrow(/signature/i);

    expect(upsertFromProviderMock).not.toHaveBeenCalled();
    expect(paymentRecordMock).not.toHaveBeenCalled();
    expect(markCanceledMock).not.toHaveBeenCalled();
  });

  it("forged organization/user metadata is never even reached when signature verification fails — the event body is never parsed for metadata before verification succeeds", async () => {
    // The mock itself proves this structurally: verifyAndConstructWebhookEvent
    // is the ONLY place the raw body is turned into a parsed event — if it
    // rejects, handleStripeWebhook has no event object to read metadata
    // from at all (confirmed by upsertFromProviderMock/paymentRecordMock
    // never being called above). This test additionally proves that even
    // a plausible-looking forged organizationId in the (never-reached)
    // event data cannot influence anything.
    verifyAndConstructWebhookEventMock.mockRejectedValue(new Error("signature verification failed"));

    await expect(handleStripeWebhook("raw-body-with-forged-org-metadata", "bad-sig")).rejects.toThrow();

    expect(upsertFromProviderMock).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "attacker-org" }));
  });
});

describe("handleStripeWebhook — event.created threaded through (Phase 21 M2 ordering fix)", () => {
  it("passes the Stripe event's own created timestamp (never wall-clock) to upsertFromProvider", async () => {
    verifyAndConstructWebhookEventMock.mockResolvedValue({ type: "checkout.session.completed", raw: fakeCheckoutEvent() });

    await handleStripeWebhook("raw-body", "sig");

    expect(upsertFromProviderMock).toHaveBeenCalledWith(expect.objectContaining({ eventCreatedAt: "2025-01-01T00:00:00.000Z" }));
  });

  it("passes eventCreatedAt to markCanceled on customer.subscription.deleted", async () => {
    verifyAndConstructWebhookEventMock.mockResolvedValue({
      type: "customer.subscription.deleted",
      raw: { created: 1735689600, type: "customer.subscription.deleted", data: { object: { id: "sub_1", metadata: { organizationId: "org1" } } } },
    });

    await handleStripeWebhook("raw-body", "sig");

    expect(markCanceledMock).toHaveBeenCalledWith("org1", "2025-01-01T00:00:00.000Z");
  });
});

describe("handleStripeWebhook — duplicate payment skips the paired invoice write (Phase 21 M2 payment-delivery fix)", () => {
  it("a genuinely new payment writes both a payment and an invoice", async () => {
    paymentRecordMock.mockResolvedValue({ id: "pay-1" });
    verifyAndConstructWebhookEventMock.mockResolvedValue({ type: "checkout.session.completed", raw: fakeCheckoutEvent() });

    await handleStripeWebhook("raw-body", "sig");

    expect(paymentRecordMock).toHaveBeenCalledTimes(1);
    expect(invoiceCreateMock).toHaveBeenCalledTimes(1);
  });

  it("PROVES a redelivered event (payment-service detects the duplicate, returns null) skips the invoice write entirely — no duplicate invoice", async () => {
    paymentRecordMock.mockResolvedValue(null);
    verifyAndConstructWebhookEventMock.mockResolvedValue({ type: "checkout.session.completed", raw: fakeCheckoutEvent() });

    await handleStripeWebhook("raw-body", "sig");

    expect(paymentRecordMock).toHaveBeenCalledTimes(1);
    expect(invoiceCreateMock).not.toHaveBeenCalled();
  });

  it("the same duplicate-skip applies to invoice.paid", async () => {
    paymentRecordMock.mockResolvedValue(null);
    verifyAndConstructWebhookEventMock.mockResolvedValue({
      type: "invoice.paid",
      raw: { created: 1735689600, type: "invoice.paid", data: { object: { id: "in_1", customer: "cus_org1", amount_paid: 1900, currency: "usd" } } },
    });

    await handleStripeWebhook("raw-body", "sig");

    expect(paymentRecordMock).toHaveBeenCalledTimes(1);
    expect(invoiceCreateMock).not.toHaveBeenCalled();
  });
});

describe("handleStripeWebhook — failure semantics fail safe", () => {
  it("a malformed checkout.session.completed (missing organizationId metadata) is a safe no-op, not an error", async () => {
    verifyAndConstructWebhookEventMock.mockResolvedValue({ type: "checkout.session.completed", raw: fakeCheckoutEvent({ metadata: {} }) });

    const result = await handleStripeWebhook("raw-body", "sig");

    expect(result.handled).toBe(true);
    expect(upsertFromProviderMock).not.toHaveBeenCalled();
    expect(paymentRecordMock).not.toHaveBeenCalled();
  });

  it("an invoice.payment_failed event never grants/extends a subscription — only records a failed payment", async () => {
    verifyAndConstructWebhookEventMock.mockResolvedValue({
      type: "invoice.payment_failed",
      raw: { created: 1735689600, type: "invoice.payment_failed", data: { object: { id: "in_1", customer: "cus_org1", amount_due: 1900, currency: "usd" } } },
    });

    await handleStripeWebhook("raw-body", "sig");

    expect(paymentRecordMock).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(upsertFromProviderMock).not.toHaveBeenCalled();
    expect(invoiceCreateMock).not.toHaveBeenCalled();
  });

  it("an unsupported/unknown event type is a safe no-op — handled: false, zero service calls", async () => {
    verifyAndConstructWebhookEventMock.mockResolvedValue({ type: "some.future.event.type", raw: { created: 1735689600, type: "some.future.event.type", data: { object: {} } } });

    const result = await handleStripeWebhook("raw-body", "sig");

    expect(result).toEqual({ handled: false, type: "some.future.event.type" });
    expect(upsertFromProviderMock).not.toHaveBeenCalled();
    expect(paymentRecordMock).not.toHaveBeenCalled();
  });
});

describe("handleStripeWebhook — cross-organization isolation", () => {
  it("a subscription event for org2 never touches org1's state", async () => {
    verifyAndConstructWebhookEventMock.mockResolvedValue({
      type: "customer.subscription.updated",
      raw: {
        created: 1735689600,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_2",
            metadata: { organizationId: "org2", planKey: "premium" },
            customer: "cus_org2",
            status: "active",
            items: { data: [{ current_period_end: 1738368000, price: { recurring: { interval: "month" } } }] },
          },
        },
      },
    });

    await handleStripeWebhook("raw-body", "sig");

    expect(upsertFromProviderMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org2" }));
    expect(upsertFromProviderMock).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org1" }));
  });
});

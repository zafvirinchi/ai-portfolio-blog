import { beforeEach, describe, expect, it, vi } from "vitest";

const createStripeCustomerMock = vi.fn();
const createCheckoutSessionMock = vi.fn();
const createPortalSessionMock = vi.fn();
const verifyPlatformWebhookSignatureMock = vi.fn();
const resolvePlanKeyFromPriceIdMock = vi.fn();

vi.mock("./platform-stripe-provider", () => ({
  createStripeCustomer: (...args: unknown[]) => createStripeCustomerMock(...args),
  createCheckoutSession: (...args: unknown[]) => createCheckoutSessionMock(...args),
  createPortalSession: (...args: unknown[]) => createPortalSessionMock(...args),
  verifyPlatformWebhookSignature: (...args: unknown[]) => verifyPlatformWebhookSignatureMock(...args),
  resolvePlanKeyFromPriceId: (...args: unknown[]) => resolvePlanKeyFromPriceIdMock(...args),
}));

const getCustomerByUserIdMock = vi.fn();
const getUserIdByStripeCustomerIdMock = vi.fn();
const resolveStripeBackedPlanMock = vi.fn();
const saveCustomerMock = vi.fn();
const upsertSubscriptionMock = vi.fn();

vi.mock("./platform-subscription-service", () => ({
  getCustomerByUserId: (...args: unknown[]) => getCustomerByUserIdMock(...args),
  getUserIdByStripeCustomerId: (...args: unknown[]) => getUserIdByStripeCustomerIdMock(...args),
  resolveStripeBackedPlan: (...args: unknown[]) => resolveStripeBackedPlanMock(...args),
  saveCustomer: (...args: unknown[]) => saveCustomerMock(...args),
  upsertSubscription: (...args: unknown[]) => upsertSubscriptionMock(...args),
}));

import {
  DuplicateSubscriptionError,
  handlePlatformStripeWebhook,
  initiateCheckout,
  InvalidPlanError,
  NoBillingAccountError,
  createBillingPortalSession,
} from "./platform-billing-service";

// Phase 18 Milestone 2 — platform-billing-service.ts is the ONE
// orchestration layer; these tests exercise its real logic (plan
// validation, customer reuse, duplicate-subscription prevention, and —
// most importantly, Step 16 #15 — webhook metadata reconciliation
// against the resolved Stripe customer mapping) against mocked
// dependencies, never a live Stripe connection (real signature
// verification is covered separately in platform-stripe-provider.test.ts).

beforeEach(() => {
  createStripeCustomerMock.mockReset();
  createCheckoutSessionMock.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/fake" });
  createPortalSessionMock.mockReset().mockResolvedValue({ url: "https://billing.stripe.com/fake" });
  verifyPlatformWebhookSignatureMock.mockReset();
  resolvePlanKeyFromPriceIdMock.mockReset();
  getCustomerByUserIdMock.mockReset();
  getUserIdByStripeCustomerIdMock.mockReset();
  resolveStripeBackedPlanMock.mockReset().mockResolvedValue(null);
  saveCustomerMock.mockReset();
  upsertSubscriptionMock.mockReset();
});

describe("initiateCheckout — Step 6/7 plan validation and Step 5 customer reuse", () => {
  it("rejects an unrecognized plan before anything reaches Stripe (Step 16 #4)", async () => {
    await expect(initiateCheckout({ userId: "u1", email: "u1@example.com", planKey: "NOT_A_REAL_PLAN", origin: "https://app.example.com" })).rejects.toBeInstanceOf(InvalidPlanError);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("rejects a real-but-not-Stripe-backed plan (a FREE tier) — Step 16 #3, never lets the client select an arbitrary price via a free plan key", async () => {
    await expect(initiateCheckout({ userId: "u1", email: "u1@example.com", planKey: "JOB_SEEKER_FREE", origin: "https://app.example.com" })).rejects.toBeInstanceOf(InvalidPlanError);
  });

  it("reuses an existing Stripe customer instead of creating a duplicate", async () => {
    getCustomerByUserIdMock.mockResolvedValue({ id: "row1", user_id: "u1", stripe_customer_id: "cus_existing", email: "u1@example.com", created_at: "", updated_at: "" });

    await initiateCheckout({ userId: "u1", email: "u1@example.com", planKey: "JOB_SEEKER_PRO", origin: "https://app.example.com" });

    expect(createStripeCustomerMock).not.toHaveBeenCalled();
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(expect.objectContaining({ stripeCustomerId: "cus_existing" }));
  });

  it("creates a new Stripe customer only when none is mapped yet, and persists the mapping", async () => {
    getCustomerByUserIdMock.mockResolvedValue(null);
    createStripeCustomerMock.mockResolvedValue("cus_new");

    await initiateCheckout({ userId: "u1", email: "u1@example.com", planKey: "JOB_SEEKER_PRO", origin: "https://app.example.com" });

    expect(createStripeCustomerMock).toHaveBeenCalledWith("u1@example.com", "u1");
    expect(saveCustomerMock).toHaveBeenCalledWith({ userId: "u1", stripeCustomerId: "cus_new", email: "u1@example.com" });
  });

  it("prevents starting a second checkout when the user already has an active subscription in the same plan family (Step 9's duplicate-prevention concern, applied at checkout time)", async () => {
    resolveStripeBackedPlanMock.mockResolvedValue({ plan_id: "JOB_SEEKER_PRO", status: "active" });

    await expect(initiateCheckout({ userId: "u1", email: "u1@example.com", planKey: "JOB_SEEKER_PREMIUM", origin: "https://app.example.com" })).rejects.toBeInstanceOf(DuplicateSubscriptionError);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("does NOT block a Recruiter checkout merely because the user already has an active Job Seeker subscription — plan families are independent (Step 3)", async () => {
    resolveStripeBackedPlanMock.mockImplementation((_userId: string, role: string) => Promise.resolve(role === "JOB_SEEKER" ? { plan_id: "JOB_SEEKER_PRO", status: "active" } : null));
    getCustomerByUserIdMock.mockResolvedValue({ id: "row1", user_id: "u1", stripe_customer_id: "cus_1", email: null, created_at: "", updated_at: "" });

    await expect(initiateCheckout({ userId: "u1", email: null, planKey: "RECRUITER_PRO", origin: "https://app.example.com" })).resolves.toEqual({ url: "https://checkout.stripe.com/fake" });
  });
});

describe("createBillingPortalSession — Step 13", () => {
  it("rejects when the user has no billing account yet, never fabricating a portal URL", async () => {
    getCustomerByUserIdMock.mockResolvedValue(null);
    await expect(createBillingPortalSession("u1", "https://app.example.com/settings/billing")).rejects.toBeInstanceOf(NoBillingAccountError);
  });

  it("uses the server-resolved customer id — never a client-supplied one (Step 13/16 #10)", async () => {
    getCustomerByUserIdMock.mockResolvedValue({ id: "row1", user_id: "u1", stripe_customer_id: "cus_real", email: null, created_at: "", updated_at: "" });
    await createBillingPortalSession("u1", "https://app.example.com/settings/billing");
    expect(createPortalSessionMock).toHaveBeenCalledWith("cus_real", "https://app.example.com/settings/billing");
  });
});

describe("handlePlatformStripeWebhook — Step 8/9/16", () => {
  // Phase 18 Milestone 6 — every real Stripe.Event carries its own
  // `created` (unix seconds); defaults here to an arbitrary fixed value
  // so upsertFromStripeSubscription()'s eventCreatedAt derivation never
  // hits `new Date(NaN)` in these tests, matching what a real event
  // always provides.
  function stubEvent(type: string, object: Record<string, unknown>, created = 1700000000) {
    verifyPlatformWebhookSignatureMock.mockResolvedValue({ type, raw: { type, created, data: { object } } });
  }

  it("returns handled:false for an event type this webhook doesn't process, without touching any storage", async () => {
    stubEvent("invoice.paid", {});
    const result = await handlePlatformStripeWebhook("raw", "sig");
    expect(result).toEqual({ handled: false, type: "invoice.paid" });
    expect(upsertSubscriptionMock).not.toHaveBeenCalled();
  });

  it("propagates a real signature verification failure (never silently swallowed)", async () => {
    verifyPlatformWebhookSignatureMock.mockRejectedValue(new Error("signature verification failed"));
    await expect(handlePlatformStripeWebhook("raw", "bad-sig")).rejects.toThrow("signature verification failed");
  });

  it("ignores a subscription event for a Stripe customer with no known platform user mapping, rather than guessing", async () => {
    getUserIdByStripeCustomerIdMock.mockResolvedValue(null);
    stubEvent("customer.subscription.updated", { id: "sub_1", customer: "cus_unknown", status: "active", cancel_at_period_end: false, canceled_at: null, items: { data: [{ price: { id: "price_1" }, current_period_start: 0, current_period_end: 0 }] }, metadata: {} });

    await handlePlatformStripeWebhook("raw", "sig");
    expect(upsertSubscriptionMock).not.toHaveBeenCalled();
  });

  it("Step 16 #15 — a subscription event with FORGED metadata.userId is still written under the REAL user resolved from the Stripe customer mapping, never the forged one", async () => {
    getUserIdByStripeCustomerIdMock.mockResolvedValue("real-user");
    resolvePlanKeyFromPriceIdMock.mockReturnValue("JOB_SEEKER_PRO");
    stubEvent("customer.subscription.updated", {
      id: "sub_1",
      customer: "cus_real_user",
      status: "active",
      cancel_at_period_end: false,
      canceled_at: null,
      items: { data: [{ price: { id: "price_1" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
      // An attacker (or a bug) claims this subscription belongs to a
      // DIFFERENT user via metadata — this must never be trusted over
      // the real customer<->user mapping resolved above.
      metadata: { userId: "attacker-controlled-victim-id" },
    });

    await handlePlatformStripeWebhook("raw", "sig");

    expect(upsertSubscriptionMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "real-user" }));
    expect(upsertSubscriptionMock).not.toHaveBeenCalledWith(expect.objectContaining({ userId: "attacker-controlled-victim-id" }));
  });

  it("ignores a subscription whose price id doesn't map to any known platform plan, rather than writing a row with an invalid plan_id", async () => {
    getUserIdByStripeCustomerIdMock.mockResolvedValue("u1");
    resolvePlanKeyFromPriceIdMock.mockReturnValue(null);
    stubEvent("customer.subscription.updated", {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: false,
      canceled_at: null,
      items: { data: [{ price: { id: "price_unknown" }, current_period_start: 0, current_period_end: 0 }] },
      metadata: {},
    });

    await handlePlatformStripeWebhook("raw", "sig");
    expect(upsertSubscriptionMock).not.toHaveBeenCalled();
  });

  it("customer.subscription.deleted upserts with status 'canceled' — Stripe's own status on that event — via the identical, idempotent upsert path as created/updated", async () => {
    getUserIdByStripeCustomerIdMock.mockResolvedValue("u1");
    resolvePlanKeyFromPriceIdMock.mockReturnValue("JOB_SEEKER_PRO");
    stubEvent("customer.subscription.deleted", {
      id: "sub_1",
      customer: "cus_1",
      status: "canceled",
      cancel_at_period_end: false,
      canceled_at: 1700000000,
      items: { data: [{ price: { id: "price_1" }, current_period_start: 0, current_period_end: 0 }] },
      metadata: {},
    });

    await handlePlatformStripeWebhook("raw", "sig");
    expect(upsertSubscriptionMock).toHaveBeenCalledWith(expect.objectContaining({ status: "canceled", userId: "u1" }));
  });

  it("checkout.session.completed with mismatched metadata/customer mapping is ignored defensively, never overwriting an existing different user's customer row", async () => {
    getUserIdByStripeCustomerIdMock.mockResolvedValue("existing-real-user");
    stubEvent("checkout.session.completed", { id: "cs_1", customer: "cus_1", metadata: { userId: "someone-else" }, customer_details: { email: "x@example.com" } });

    await handlePlatformStripeWebhook("raw", "sig");
    expect(saveCustomerMock).not.toHaveBeenCalled();
  });

  it("Phase 18 Milestone 6 — passes the Stripe EVENT's own created time (never the subscription object's, never wall-clock now) as eventCreatedAt, for upsertSubscription()'s out-of-order guard", async () => {
    getUserIdByStripeCustomerIdMock.mockResolvedValue("u1");
    resolvePlanKeyFromPriceIdMock.mockReturnValue("JOB_SEEKER_PRO");
    stubEvent(
      "customer.subscription.updated",
      { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, canceled_at: null, items: { data: [{ price: { id: "price_1" }, current_period_start: 0, current_period_end: 0 }] }, metadata: {} },
      1712345678
    );

    await handlePlatformStripeWebhook("raw", "sig");

    expect(upsertSubscriptionMock).toHaveBeenCalledWith(expect.objectContaining({ eventCreatedAt: new Date(1712345678 * 1000).toISOString() }));
  });
});

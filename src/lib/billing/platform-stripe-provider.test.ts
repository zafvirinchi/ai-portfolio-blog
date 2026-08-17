import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolvePlanKeyFromPriceId, resolveStripePriceId, verifyPlatformWebhookSignature, PlanNotStripeBackedError } from "./platform-stripe-provider";

// Phase 18 Milestone 2, Step 18 — "where practical, test signature
// verification... at the real service boundary" — this file does NOT
// mock the `stripe` package. It uses a fake secret key (signature
// verification is pure HMAC crypto and never makes a real Stripe API
// call, so no real credentials or network access are needed) and
// Stripe's own generateTestHeaderString() helper to produce a
// genuinely valid signature for one payload, then asserts real
// rejection for an invalid one — exercising stripe.webhooks.
// constructEventAsync() for real, not a mocked stand-in for it.

const FAKE_SECRET_KEY = "sk_test_fake_for_signature_verification_only";
const FAKE_WEBHOOK_SECRET = "whsec_test_fake_signing_secret";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = FAKE_SECRET_KEY;
  process.env.STRIPE_PLATFORM_WEBHOOK_SECRET = FAKE_WEBHOOK_SECRET;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("verifyPlatformWebhookSignature — real Stripe signature verification (no mocking)", () => {
  it("accepts a genuinely validly-signed payload and returns the parsed event", async () => {
    const payload = JSON.stringify({ id: "evt_test_1", type: "customer.subscription.updated", data: { object: { id: "sub_test_1" } } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: FAKE_WEBHOOK_SECRET });

    const result = await verifyPlatformWebhookSignature(payload, header);

    expect(result.type).toBe("customer.subscription.updated");
    expect((result.raw as Stripe.Event).id).toBe("evt_test_1");
  });

  it("rejects a payload with an invalid/forged signature (Step 16 #5)", async () => {
    const payload = JSON.stringify({ id: "evt_test_2", type: "customer.subscription.updated", data: { object: {} } });

    await expect(verifyPlatformWebhookSignature(payload, "t=1,v1=0000000000000000000000000000000000000000000000000000000000000000")).rejects.toThrow();
  });

  it("rejects a payload that was modified AFTER being signed (Step 16 #6) — same signature, different body", async () => {
    const originalPayload = JSON.stringify({ id: "evt_test_3", type: "customer.subscription.updated", data: { object: { id: "sub_original" } } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload: originalPayload, secret: FAKE_WEBHOOK_SECRET });

    const tamperedPayload = JSON.stringify({ id: "evt_test_3", type: "customer.subscription.updated", data: { object: { id: "sub_TAMPERED" } } });

    await expect(verifyPlatformWebhookSignature(tamperedPayload, header)).rejects.toThrow();
  });

  it("rejects when signed with a DIFFERENT webhook secret than the one configured (e.g. the organization webhook's own secret, mistakenly reused)", async () => {
    const payload = JSON.stringify({ id: "evt_test_4", type: "customer.subscription.updated", data: { object: {} } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_a_completely_different_secret" });

    await expect(verifyPlatformWebhookSignature(payload, header)).rejects.toThrow();
  });

  it("throws a clear configuration error (never a fabricated success) when STRIPE_PLATFORM_WEBHOOK_SECRET isn't set", async () => {
    delete process.env.STRIPE_PLATFORM_WEBHOOK_SECRET;
    const payload = JSON.stringify({ id: "evt_test_5", type: "customer.subscription.updated", data: { object: {} } });

    await expect(verifyPlatformWebhookSignature(payload, "t=1,v1=anything")).rejects.toThrow(/STRIPE_PLATFORM_WEBHOOK_SECRET/);
  });
});

describe("resolveStripePriceId / resolvePlanKeyFromPriceId — Step 6 price mapping", () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_JOB_SEEKER_PRO = "price_job_seeker_pro_test";
    process.env.STRIPE_PRICE_JOB_SEEKER_PREMIUM = "price_job_seeker_premium_test";
    process.env.STRIPE_PRICE_RECRUITER_PRO = "price_recruiter_pro_test";
    process.env.STRIPE_PRICE_RECRUITER_BUSINESS = "price_recruiter_business_test";
  });

  it("resolves a real Stripe-backed plan to its configured price id", () => {
    expect(resolveStripePriceId("JOB_SEEKER_PRO")).toBe("price_job_seeker_pro_test");
  });

  it("rejects a plan that isn't Stripe-backed at all (Step 6/7 — never invents a price for FREE tiers)", () => {
    expect(() => resolveStripePriceId("JOB_SEEKER_FREE")).toThrow(PlanNotStripeBackedError);
  });

  it("rejects an arbitrary/unrecognized string — never a client-controlled Stripe price id (Step 16 #3)", () => {
    expect(() => resolveStripePriceId("literally-anything-a-client-could-send")).toThrow(PlanNotStripeBackedError);
  });

  it("throws when the plan is valid but its env var isn't configured yet — never falls back to a fabricated id", () => {
    delete process.env.STRIPE_PRICE_RECRUITER_BUSINESS;
    expect(() => resolveStripePriceId("RECRUITER_BUSINESS")).toThrow(/STRIPE_PRICE_RECRUITER_BUSINESS/);
  });

  it("the price->plan lookup is the exact inverse of the plan->price lookup", () => {
    expect(resolvePlanKeyFromPriceId("price_recruiter_pro_test")).toBe("RECRUITER_PRO");
  });

  it("returns null (never guesses) for a price id that doesn't map to any configured plan", () => {
    expect(resolvePlanKeyFromPriceId("price_unrelated_or_forged")).toBeNull();
  });
});

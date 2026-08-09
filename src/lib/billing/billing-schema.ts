import { z } from "zod";

// Phase 14 Milestone 3. Snake_case kept verbatim for row shapes
// (matching src/lib/saas/organization-schema.ts's established
// convention) rather than a camelCase mapping layer.

export const PLAN_KEYS = ["free", "professional", "premium", "enterprise"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled", "grace_period"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const BILLING_INTERVALS = ["monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

// Only "stripe" is a real, implemented adapter — the rest exist so the
// provider registry's type union (and this schema) never need to
// change shape when a real adapter is added later, per the spec's own
// "future providers must require only a new adapter" requirement.
export const PAYMENT_PROVIDERS = ["stripe", "razorpay", "paypal", "paddle", "lemonsqueezy"] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = ["succeeded", "failed", "pending", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const INVOICE_STATUSES = ["paid", "open", "void", "uncollectible"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const DISCOUNT_TYPES = ["percentage", "flat"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

// The AI features the credit engine actually meters — each maps to one
// of the ~10 existing routes wired with checkCredits()/consumeCredits().
export const FEATURE_KEYS = [
  "resume_upload",
  "resume_rewrite",
  "jd_match",
  "ats_report",
  "mock_interview",
  "ai_chat",
  "knowledge_upload",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

// Plan limit keys beyond the metered features above — checked
// elsewhere (org member count, storage), not through credit-service.ts.
export const STRUCTURAL_LIMIT_KEYS = ["organization_seats", "storage_mb"] as const;
export type StructuralLimitKey = (typeof STRUCTURAL_LIMIT_KEYS)[number];

// ---------------------------------------------------------------------------
// API request-body validation schemas.
// ---------------------------------------------------------------------------

export const checkoutSchema = z.object({
  planKey: z.enum(PLAN_KEYS).refine((key) => key !== "free", "Checkout is only for paid plans"),
  billingInterval: z.enum(BILLING_INTERVALS),
  couponCode: z.string().optional(),
});

export const changeSubscriptionSchema = z.object({
  planKey: z.enum(PLAN_KEYS),
  billingInterval: z.enum(BILLING_INTERVALS).optional(),
});

export const applyCouponSchema = z.object({
  code: z.string().min(1),
});

export const couponCreateSchema = z.object({
  code: z.string().min(1),
  discountType: z.enum(DISCOUNT_TYPES),
  value: z.number().int().positive(),
  maxRedemptions: z.number().int().positive().optional(),
  recurring: z.boolean().optional().default(false),
  expiresAt: z.string().datetime().optional(),
});

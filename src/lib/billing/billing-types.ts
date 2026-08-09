import { BillingInterval, DiscountType, FeatureKey, InvoiceStatus, PaymentProviderId, PaymentStatus, PlanKey, SubscriptionStatus } from "./billing-schema";

// Non-schema row/wrapper types — mirrors src/lib/saas/organization-types.ts's
// role relative to organization-schema.ts.

export interface PlanLimits {
  resume_upload: number | null;
  resume_rewrite: number | null;
  jd_match: number | null;
  ats_report: number | null;
  mock_interview: number | null;
  ai_chat: number | null;
  knowledge_upload: number | null;
  organization_seats: number | null;
  storage_mb: number | null;
}

export interface Plan {
  id: string;
  key: PlanKey;
  name: string;
  monthly_price_cents: number;
  yearly_price_cents: number;
  limits: PlanLimits;
  priority_support: boolean;
  api_access: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_interval: BillingInterval;
  provider: PaymentProviderId;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at: string | null;
  grace_period_end: string | null;
  created_at: string;
  updated_at: string;
}

/** Returned by subscription-service.ts's getActiveSubscription() — either a real DB row (isImplicitFree: false) or a virtual Free-plan object with no backing row. */
export interface ResolvedSubscription extends Subscription {
  plan: Plan;
  isImplicitFree: boolean;
}

export interface Payment {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  provider: PaymentProviderId;
  provider_payment_id: string | null;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  created_at: string;
}

export interface Invoice {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  invoice_number: string;
  amount_cents: number;
  tax_cents: number;
  discount_cents: number;
  currency: string;
  status: InvoiceStatus;
  created_at: string;
}

export interface CreditTransaction {
  id: string;
  organization_id: string;
  feature_key: FeatureKey | string;
  amount: number;
  balance_after: number | null;
  created_at: string;
}

export interface UsageTrackingEntry {
  id: string;
  organization_id: string;
  user_id: string | null;
  feature_key: FeatureKey | string;
  credits_consumed: number;
  duration_ms: number | null;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: DiscountType;
  value: number;
  max_redemptions: number | null;
  redemption_count: number;
  recurring: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface Discount {
  id: string;
  organization_id: string;
  coupon_id: string;
  subscription_id: string | null;
  applied_at: string;
  expires_at: string | null;
}

export interface CreditBalance {
  featureKey: FeatureKey;
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface AdminBillingOverview {
  mrrCents: number;
  arrCents: number;
  totalRevenueCents: number;
  activeSubscriptions: number;
  cancelledSubscriptions: number;
  churnRate: number;
  arpuCents: number;
  creditConsumption: { featureKey: string; total: number }[];
}

export class InsufficientCreditsError extends Error {
  constructor(
    public featureKey: FeatureKey,
    public limit: number,
    public used: number
  ) {
    super(`Monthly limit reached for ${featureKey} (${used}/${limit} used). Upgrade your plan for more.`);
    this.name = "InsufficientCreditsError";
  }
}

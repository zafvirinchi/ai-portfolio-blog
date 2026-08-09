import { BillingInterval, PaymentProviderId } from "./billing-schema";
import { Plan } from "./billing-types";
import { stripeBillingProvider } from "./stripe-provider";

// Provider-agnostic interface — billing-service.ts is the ONLY caller
// of this anywhere in the app; nothing else ever imports the `stripe`
// package or calls Stripe directly. Adding a real Razorpay/PayPal/
// Paddle/LemonSqueezy adapter later means writing one new class that
// implements this interface and registering it in getBillingProvider()
// below — no other file changes.

export interface CheckoutSessionInput {
  organizationId: string;
  plan: Plan;
  billingInterval: BillingInterval;
  unitAmountCents: number; // already discount-applied by billing-service.ts via coupon-service.ts
  customerEmail: string | null;
  existingCustomerId: string | null;
  successUrl: string;
  cancelUrl: string;
  couponCode?: string;
}

export interface PortalSessionInput {
  customerId: string;
  returnUrl: string;
}

export interface ProviderWebhookEvent {
  type: string;
  raw: unknown;
}

export interface BillingProvider {
  readonly id: PaymentProviderId;
  createCheckoutSession(input: CheckoutSessionInput): Promise<{ url: string }>;
  createPortalSession(input: PortalSessionInput): Promise<{ url: string }>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  resumeSubscription(providerSubscriptionId: string): Promise<void>;
  verifyAndConstructWebhookEvent(rawBody: string, signature: string): Promise<ProviderWebhookEvent>;
}

export class ProviderNotImplementedError extends Error {
  constructor(providerId: PaymentProviderId) {
    super(`Payment provider "${providerId}" is declared but not yet implemented — only "stripe" is wired up. Add a new adapter implementing BillingProvider to support it.`);
    this.name = "ProviderNotImplementedError";
  }
}

/** The single place a provider id resolves to a real adapter — swap or extend this map, nothing else, to add a provider. */
export function getBillingProvider(id: PaymentProviderId): BillingProvider {
  if (id === "stripe") {
    return stripeBillingProvider;
  }

  throw new ProviderNotImplementedError(id);
}

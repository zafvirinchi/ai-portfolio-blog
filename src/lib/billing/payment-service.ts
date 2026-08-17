import { supabaseAdmin } from "../supabase/admin";

import { PaymentProviderId, PaymentStatus } from "./billing-schema";
import { Payment } from "./billing-types";

const LOG_PREFIX = "[billing]";

export interface PaymentRecordInput {
  organizationId: string;
  subscriptionId: string | null;
  provider: PaymentProviderId;
  providerPaymentId: string | null;
  amountCents: number;
  currency?: string;
  status: PaymentStatus;
}

/**
 * Phase 21 Milestone 2 — audit finding: this was a plain unconditional
 * insert with no idempotency check, so a genuine Stripe webhook
 * redelivery (checkout.session.completed / invoice.paid /
 * invoice.payment_failed all reach this function) created a second
 * `payments` row for the same real-world payment, directly inflating the
 * admin-facing Total Revenue/ARPU figures (src/app/admin/billing/page.tsx
 * sums this table directly) and duplicating the organization's own
 * invoice history.
 *
 * Fixed with a dedup lookup by (organization_id, provider_payment_id) —
 * `provider_payment_id` is the real Stripe payment_intent/invoice id, a
 * stable identifier a genuine redelivery of the SAME event always
 * carries unchanged. Returns null (no new row written) when a payment
 * with this id already exists, rather than throwing — a duplicate
 * delivery is expected Stripe behavior, not an error; callers use the
 * null return to also skip a duplicate invoice write (see
 * billing-service.ts).
 *
 * Deliberately a plain check-then-insert, not a DB-level unique
 * constraint + atomic upsert: `provider_payment_id` has no unique index
 * (adding one would be a migration this milestone's audit determined
 * isn't required — see the module test file for the full reasoning).
 * The real-world threat model this protects against is Stripe's own
 * retry behavior, which is sequential (a retry only fires after a prior
 * delivery attempt has already finished, succeeded or failed) — not
 * genuinely concurrent duplicate delivery — so this non-atomic guard is
 * judged sufficient for the actual risk, not claimed to be strictly
 * race-proof. The dedup LOOKUP itself fails open (proceeds to insert) on
 * a Supabase error, deliberately the opposite choice from the anonymous
 * AI rate limiter's fail-closed behavior: losing/blocking a genuine
 * payment record is worse here than the rare residual risk of a
 * duplicate row when the dedup check itself can't be evaluated. The
 * insert itself is unchanged — it still throws normally on failure,
 * correctly surfacing as a retry-worthy webhook failure to Stripe.
 */
export async function record(input: PaymentRecordInput): Promise<Payment | null> {
  if (input.providerPaymentId) {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("provider_payment_id", input.providerPaymentId)
      .maybeSingle();

    if (lookupError) {
      console.error(`${LOG_PREFIX} Duplicate-payment lookup failed, proceeding to record (best-effort dedup only)`, lookupError);
    } else if (existing) {
      console.warn(`${LOG_PREFIX} Duplicate payment webhook delivery ignored`, {
        organizationId: input.organizationId,
        providerPaymentId: input.providerPaymentId,
      });
      return null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("payments")
    .insert({
      organization_id: input.organizationId,
      subscription_id: input.subscriptionId,
      provider: input.provider,
      provider_payment_id: input.providerPaymentId,
      amount_cents: input.amountCents,
      currency: input.currency ?? "usd",
      status: input.status,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} ${input.status === "succeeded" ? "Payment Success" : "Payment Failed"}`, {
    organizationId: input.organizationId,
    amountCents: input.amountCents,
  });

  return data as Payment;
}

export async function list(organizationId: string, limit = 50): Promise<Payment[]> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

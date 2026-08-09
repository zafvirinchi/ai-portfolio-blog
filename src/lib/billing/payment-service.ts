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

export async function record(input: PaymentRecordInput): Promise<Payment> {
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

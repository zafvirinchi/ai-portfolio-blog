import { supabaseAdmin } from "../supabase/admin";

import { InvoiceStatus } from "./billing-schema";
import { Invoice } from "./billing-types";

const LOG_PREFIX = "[billing]";

async function nextInvoiceNumber(): Promise<string> {
  const { count, error } = await supabaseAdmin.from("invoices").select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(error.message);
  }

  const sequence = (count ?? 0) + 1;
  return `INV-${new Date().getUTCFullYear()}-${String(sequence).padStart(6, "0")}`;
}

export interface InvoiceCreateInput {
  organizationId: string;
  subscriptionId: string | null;
  amountCents: number;
  taxCents?: number;
  discountCents?: number;
  currency?: string;
  status?: InvoiceStatus;
}

export async function create(input: InvoiceCreateInput): Promise<Invoice> {
  const invoiceNumber = await nextInvoiceNumber();

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .insert({
      organization_id: input.organizationId,
      subscription_id: input.subscriptionId,
      invoice_number: invoiceNumber,
      amount_cents: input.amountCents,
      tax_cents: input.taxCents ?? 0,
      discount_cents: input.discountCents ?? 0,
      currency: input.currency ?? "usd",
      status: input.status ?? "paid",
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  console.log(`${LOG_PREFIX} Invoice Generated`, { organizationId: input.organizationId, invoiceNumber });

  return data as Invoice;
}

export async function list(organizationId: string, limit = 50): Promise<Invoice[]> {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getById(id: string): Promise<Invoice | null> {
  const { data, error } = await supabaseAdmin.from("invoices").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as Invoice) ?? null;
}

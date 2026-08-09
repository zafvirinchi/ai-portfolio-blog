import { supabaseAdmin } from "../supabase/admin";

import { DiscountType } from "./billing-schema";
import { Coupon, Discount } from "./billing-types";

const LOG_PREFIX = "[billing]";

export interface CouponCreateInput {
  code: string;
  discountType: DiscountType;
  value: number;
  maxRedemptions?: number;
  recurring?: boolean;
  expiresAt?: string;
}

export async function create(input: CouponCreateInput): Promise<Coupon> {
  const { data, error } = await supabaseAdmin
    .from("coupons")
    .insert({
      code: input.code.toUpperCase(),
      discount_type: input.discountType,
      value: input.value,
      max_redemptions: input.maxRedemptions ?? null,
      recurring: input.recurring ?? false,
      expires_at: input.expiresAt ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Coupon;
}

export async function getByCode(code: string): Promise<Coupon | null> {
  const { data, error } = await supabaseAdmin.from("coupons").select("*").eq("code", code.toUpperCase()).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as Coupon) ?? null;
}

/** Throws a clear, user-facing message on any invalid state (not found, expired, exhausted). */
export async function validate(code: string): Promise<Coupon> {
  const coupon = await getByCode(code);

  if (!coupon) {
    throw new Error("That coupon code doesn't exist.");
  }

  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
    throw new Error("That coupon has expired.");
  }

  if (coupon.max_redemptions !== null && coupon.redemption_count >= coupon.max_redemptions) {
    throw new Error("That coupon has reached its redemption limit.");
  }

  return coupon;
}

export function calculateDiscount(coupon: Coupon, amountCents: number): number {
  const discount = coupon.discount_type === "percentage" ? Math.round((amountCents * coupon.value) / 100) : coupon.value;

  return Math.min(discount, amountCents);
}

export async function applyToOrganization(organizationId: string, code: string, subscriptionId: string | null): Promise<Discount> {
  const coupon = await validate(code);

  const { data, error } = await supabaseAdmin
    .from("discounts")
    .insert({
      organization_id: organizationId,
      coupon_id: coupon.id,
      subscription_id: subscriptionId,
      expires_at: coupon.recurring ? null : coupon.expires_at,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const { error: incrementError } = await supabaseAdmin
    .from("coupons")
    .update({ redemption_count: coupon.redemption_count + 1 })
    .eq("id", coupon.id);

  if (incrementError) {
    throw new Error(incrementError.message);
  }

  console.log(`${LOG_PREFIX} Coupon Applied`, { organizationId, code: coupon.code });

  return data as Discount;
}

export async function listActiveDiscounts(organizationId: string): Promise<Discount[]> {
  const { data, error } = await supabaseAdmin
    .from("discounts")
    .select("*")
    .eq("organization_id", organizationId)
    .order("applied_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

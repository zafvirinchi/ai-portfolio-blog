import { NextResponse } from "next/server";

import { couponCreateSchema } from "@/lib/billing/billing-schema";
import * as couponService from "@/lib/billing/coupon-service";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Platform-owner action (creating a redeemable coupon code), gated the
// same way as the rest of /admin — a real Supabase session, not an
// organization permission.
async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = couponCreateSchema.parse(await req.json());

    const coupon = await couponService.create({
      code: body.code,
      discountType: body.discountType,
      value: body.value,
      maxRedemptions: body.maxRedemptions,
      recurring: body.recurring,
      expiresAt: body.expiresAt,
    });

    return NextResponse.json(coupon);
  } catch (error) {
    console.error("[billing] Coupon create route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Coupon creation failed" }, { status: 422 });
  }
}

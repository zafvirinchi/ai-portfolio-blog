import { NextResponse } from "next/server";

import { applyCouponSchema } from "@/lib/billing/billing-schema";
import * as couponService from "@/lib/billing/coupon-service";

export async function POST(req: Request) {
  try {
    const body = applyCouponSchema.parse(await req.json());
    const coupon = await couponService.validate(body.code);

    return NextResponse.json({
      code: coupon.code,
      discountType: coupon.discount_type,
      value: coupon.value,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid coupon" }, { status: 422 });
  }
}

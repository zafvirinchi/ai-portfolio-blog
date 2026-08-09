import { NextResponse } from "next/server";

import { listModelPricing, updateModelPricing } from "@/lib/ai/usage/usage-policy";
import { updateModelPricingSchema } from "@/lib/ai/usage/usage-schema";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Platform-owner action, gated the same way as the rest of /admin — a
// real Supabase session, not an organization permission (mirrors
// src/app/api/billing/coupons/route.ts's requireAdmin() pattern).
async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(listModelPricing());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load pricing" }, { status: 401 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = updateModelPricingSchema.parse(await req.json());

    updateModelPricing({
      model: body.model,
      inputPricePerMillionCents: body.inputPricePerMillionCents,
      outputPricePerMillionCents: body.outputPricePerMillionCents,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 422 });
  }
}

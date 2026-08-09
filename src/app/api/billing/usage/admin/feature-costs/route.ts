import { NextResponse } from "next/server";

import { listFeatureCosts, updateFeatureCost } from "@/lib/ai/usage/usage-policy";
import { updateFeatureCostSchema } from "@/lib/ai/usage/usage-schema";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
    return NextResponse.json(listFeatureCosts());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load feature costs" }, { status: 401 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = updateFeatureCostSchema.parse(await req.json());

    updateFeatureCost(body.feature, body.fixedCredits);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 422 });
  }
}

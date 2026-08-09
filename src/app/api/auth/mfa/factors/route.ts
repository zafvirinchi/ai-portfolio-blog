import { NextResponse } from "next/server";

import { listFactors } from "@/lib/auth/mfa-service";
import { requireAuthContext } from "@/lib/auth/permission-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    await requireAuthContext();

    const supabase = await createSupabaseRouteClient();
    const factors = await listFactors(supabase);

    return NextResponse.json(factors);
  } catch (error) {
    console.error("[auth] MFA factors route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load factors" }, { status: 422 });
  }
}

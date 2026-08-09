import { NextResponse } from "next/server";

import { enrollTotp } from "@/lib/auth/mfa-service";
import { requireAuthContext } from "@/lib/auth/permission-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

export async function POST() {
  try {
    await requireAuthContext();

    const supabase = await createSupabaseRouteClient();
    const result = await enrollTotp(supabase);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[auth] MFA TOTP enroll route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Enrollment failed" }, { status: 422 });
  }
}

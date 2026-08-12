import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { analyticsService } from "@/lib/analytics";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Platform-owner action, gated the same way as the rest of /admin — a
// real Supabase session (mirrors src/app/api/billing/coupons/route.ts's
// requireAdmin() pattern). Never trusts a userId/organizationId/role
// from the request itself.
async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const range = analyticsService.parseRangeFromSearchParams(new URL(req.url).searchParams);

    const [overview, anomalies] = await Promise.all([analyticsService.getOverview(range), analyticsService.getAnomalies()]);

    return NextResponse.json({
      range: { preset: range.preset, from: range.from.toISOString(), to: range.to.toISOString() },
      overview,
      anomalies,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    console.error("[analytics] Overview API route failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load overview" }, { status: 401 });
  }
}

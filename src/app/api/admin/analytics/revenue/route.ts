import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { analyticsService } from "@/lib/analytics";
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

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const range = analyticsService.parseRangeFromSearchParams(new URL(req.url).searchParams);
    const revenue = await analyticsService.getRevenue(range);

    return NextResponse.json({ range: { preset: range.preset, from: range.from.toISOString(), to: range.to.toISOString() }, revenue });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    console.error("[analytics] Revenue API route failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load revenue" }, { status: 401 });
  }
}

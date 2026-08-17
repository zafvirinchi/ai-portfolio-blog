import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { analyticsService } from "@/lib/analytics";
import { requireAdminRoute } from "@/lib/billing/admin-api-guard";

export async function GET(req: Request) {
  try {
    const guard = await requireAdminRoute();
    if (!guard.ok) return guard.response;
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

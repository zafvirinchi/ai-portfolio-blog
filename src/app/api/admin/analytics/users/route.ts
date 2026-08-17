import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { analyticsService } from "@/lib/analytics";
import { requireAdminRoute } from "@/lib/billing/admin-api-guard";

export async function GET(req: Request) {
  try {
    const guard = await requireAdminRoute();
    if (!guard.ok) return guard.response;
    const url = new URL(req.url);
    const range = analyticsService.parseRangeFromSearchParams(url.searchParams);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20));

    const [users, topUsers] = await Promise.all([analyticsService.getUsers(range), analyticsService.getTopUsers(range, limit)]);

    return NextResponse.json({ range: { preset: range.preset, from: range.from.toISOString(), to: range.to.toISOString() }, users, topUsers });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    console.error("[analytics] Users API route failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load users" }, { status: 401 });
  }
}

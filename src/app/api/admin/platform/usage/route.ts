import { NextResponse } from "next/server";

import { aggregateUsageByFeature } from "@/lib/billing/platform-admin-service";
import { AdminAccessRequiredError, PlatformUnauthorizedError, requirePlatformAdmin } from "@/lib/billing/persona-service";

// Phase 18 Milestone 3 — Scope E. A small, bounded aggregate (one count
// per UsageMetric) — never raw event rows, never a full analytics
// platform. `since` is an optional ISO date the client may narrow the
// window by; it's just a query filter, not an identity/authorization
// input.
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();

    const since = new URL(req.url).searchParams.get("since") ?? undefined;
    const usage = await aggregateUsageByFeature(since);

    return NextResponse.json({ usage });
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof AdminAccessRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[admin/platform] Usage aggregate route failed", error);
    return NextResponse.json({ error: "Failed to load usage aggregate." }, { status: 500 });
  }
}

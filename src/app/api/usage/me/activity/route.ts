import { NextResponse } from "next/server";

import { customerAnalyticsService } from "@/lib/analytics";

const LOG_PREFIX = "[customer-analytics]";

// Recent activity — raw (non-aggregated) rows, but only ever the 4
// safe columns getMyRecentActivity()/getRecentActivityForUser() select
// (feature, timestamp, status, credits). No prompt, response, resume
// content, or other metadata is ever read from usage_tracking here —
// that table doesn't store any of that in the first place.
export async function GET(req: Request) {
  try {
    const identity = await customerAnalyticsService.resolveCustomerIdentity();

    if (!identity) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!identity.organizationId) {
      return NextResponse.json({ hasOrganization: false });
    }

    console.log(`${LOG_PREFIX} Usage requested`, { userId: identity.userId, section: "activity" });

    const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? "20") || 20));
    const activity = await customerAnalyticsService.getMyRecentActivity(identity.userId, identity.organizationId, limit);

    console.log(`${LOG_PREFIX} Analytics completed`, { userId: identity.userId, section: "activity" });

    return NextResponse.json({ hasOrganization: true, activity });
  } catch (error) {
    console.error(`${LOG_PREFIX} Analytics failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to load recent activity" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

import { customerAnalyticsService } from "@/lib/analytics";
import { toCsv } from "@/lib/analytics/analytics-service";

const LOG_PREFIX = "[customer-analytics]";

// Personal usage-history CSV export — only ever this authenticated
// user's own rows within their own active organization. No entity id
// is accepted from the client; there is no way to export another
// user's history through this route.
export async function GET() {
  try {
    const identity = await customerAnalyticsService.resolveCustomerIdentity();

    if (!identity) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!identity.organizationId) {
      return NextResponse.json({ error: "You don't belong to an organization." }, { status: 404 });
    }

    console.log(`${LOG_PREFIX} Usage requested`, { userId: identity.userId, section: "export" });

    const activity = await customerAnalyticsService.getMyRecentActivity(identity.userId, identity.organizationId, 1000);
    const csv = toCsv(activity.map((row) => ({ feature: row.feature, date: row.createdAt, status: row.status, credits: row.credits })));

    console.log(`${LOG_PREFIX} Analytics completed`, { userId: identity.userId, section: "export" });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="my-ai-usage.csv"`,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Analytics failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

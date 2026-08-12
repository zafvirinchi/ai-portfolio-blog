import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getActiveSubscription } from "@/lib/billing/subscription-service";
import { customerAnalyticsService } from "@/lib/analytics";
import { toCsv } from "@/lib/analytics/analytics-service";
import { OrganizationAdminRequiredError } from "@/lib/analytics/customer-analytics-service";

const LOG_PREFIX = "[customer-analytics]";

// Organization usage CSV export — admin-gated (same
// requireOrganizationAdmin() as /api/organization/usage/users), scoped
// to exactly this organization's own aggregated feature-usage rows.
// Never accepts an organizationId — there is no way to export another
// organization's data through this route.
export async function GET(req: Request) {
  try {
    const { organizationId } = await customerAnalyticsService.requireOrganizationAdmin();

    console.log(`${LOG_PREFIX} Organization usage requested`, { organizationId, section: "export" });

    const subscription = await getActiveSubscription(organizationId);
    const range = customerAnalyticsService.parseCustomerRangeFromSearchParams(new URL(req.url).searchParams, subscription);

    const featureUsage = await customerAnalyticsService.getOrganizationFeatureUsage(organizationId, range);
    const csv = toCsv(
      featureUsage.map((row) => ({
        feature: row.feature,
        requests: row.requests,
        credits: row.credits,
        active_users: row.activeUsers,
        last_used: row.lastUsed,
      }))
    );

    console.log(`${LOG_PREFIX} Analytics completed`, { organizationId, section: "export" });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="organization-usage-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    if (error instanceof OrganizationAdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error(`${LOG_PREFIX} Analytics failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Export failed" }, { status: 401 });
  }
}

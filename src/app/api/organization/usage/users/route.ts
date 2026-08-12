import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getActiveSubscription } from "@/lib/billing/subscription-service";
import { customerAnalyticsService } from "@/lib/analytics";
import { OrganizationAdminRequiredError } from "@/lib/analytics/customer-analytics-service";

const LOG_PREFIX = "[customer-analytics]";

// Top organization users — the most sensitive customer-facing view
// (per-member request/credit breakdown), so it's the one section this
// milestone gates to organization admins (requireOrganizationAdmin()
// checks the "Manage Billing" permission derived from the caller's own
// session-resolved role, never a client-supplied role). Restricted to
// this organization's own users by getTopUsersForOrganization()'s
// database-level filter — there is no code path here that can return
// another organization's members.
export async function GET(req: Request) {
  try {
    const { organizationId } = await customerAnalyticsService.requireOrganizationAdmin();

    console.log(`${LOG_PREFIX} Organization usage requested`, { organizationId, section: "top-users" });

    const subscription = await getActiveSubscription(organizationId);
    const url = new URL(req.url);
    const range = customerAnalyticsService.parseCustomerRangeFromSearchParams(url.searchParams, subscription);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20));

    const topUsers = await customerAnalyticsService.getOrganizationTopUsers(organizationId, range, limit);

    console.log(`${LOG_PREFIX} Analytics completed`, { organizationId, section: "top-users" });

    return NextResponse.json({ range: { preset: range.preset, from: range.from.toISOString(), to: range.to.toISOString() }, topUsers });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    if (error instanceof OrganizationAdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error(`${LOG_PREFIX} Analytics failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to load organization users" }, { status: 401 });
  }
}

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getTenantContext } from "@/lib/saas/tenant-context";
import { getActiveSubscription } from "@/lib/billing/subscription-service";
import { customerAnalyticsService } from "@/lib/analytics";

const LOG_PREFIX = "[customer-analytics]";

// Organization self-serve analytics — identity comes from the
// authenticated session's active organization only (getTenantContext()),
// never from a client-supplied organizationId, so this can only ever
// return the caller's own organization's data. Open to any member of
// the organization (not admin-gated) — matches this endpoint's
// pre-existing Milestone 5 access model; only the more sensitive
// per-user breakdown (see /api/organization/usage/users) is restricted
// to organization admins. Phase 14 Milestone 6 update: now returns the
// customer-safe shape (estimatedAiCostCents dropped, limitWarning and a
// usage trend added) via customerAnalyticsService.getOrganizationUsage()
// instead of the raw admin-oriented metrics function, and accepts only
// the bounded 7d/30d/90d/billing_period range choices — never an
// arbitrary custom range.
export async function GET(req: Request) {
  try {
    const tenantContext = await getTenantContext();

    if (!tenantContext) {
      return NextResponse.json({ error: "Not authenticated or no active organization" }, { status: 401 });
    }

    console.log(`${LOG_PREFIX} Organization usage requested`, { organizationId: tenantContext.organizationId });

    const subscription = await getActiveSubscription(tenantContext.organizationId);
    const range = customerAnalyticsService.parseCustomerRangeFromSearchParams(new URL(req.url).searchParams, subscription);

    const [usage, featureUsage] = await Promise.all([
      customerAnalyticsService.getOrganizationUsage(tenantContext.organizationId, range),
      customerAnalyticsService.getOrganizationFeatureUsage(tenantContext.organizationId, range),
    ]);

    console.log(`${LOG_PREFIX} Analytics completed`, { organizationId: tenantContext.organizationId });

    return NextResponse.json({
      range: { preset: range.preset, from: range.from.toISOString(), to: range.to.toISOString(), isRealBillingCycle: range.isRealBillingCycle },
      usage,
      featureUsage,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    console.error(`${LOG_PREFIX} Analytics failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to load organization analytics" }, { status: 500 });
  }
}

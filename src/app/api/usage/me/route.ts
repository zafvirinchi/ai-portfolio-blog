import { NextResponse } from "next/server";

import { customerAnalyticsService } from "@/lib/analytics";

const LOG_PREFIX = "[customer-analytics]";

// Current plan + credit balance + limit warning for the authenticated
// user's currently active organization. Identity comes exclusively
// from resolveCustomerIdentity() (the Supabase session), never from a
// query parameter or body. A user with no organization gets
// hasOrganization:false, not an error — credits/subscriptions are
// organization-scoped in this product, so there is genuinely nothing
// to show, and the client renders the "You don't belong to an
// organization" empty state instead of an error banner.
export async function GET() {
  try {
    const identity = await customerAnalyticsService.resolveCustomerIdentity();

    if (!identity) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!identity.organizationId) {
      return NextResponse.json({ hasOrganization: false });
    }

    console.log(`${LOG_PREFIX} Usage requested`, { userId: identity.userId });

    const subscription = await customerAnalyticsService.getMySubscription(identity.organizationId);

    console.log(`${LOG_PREFIX} Analytics completed`, { userId: identity.userId });

    return NextResponse.json({ hasOrganization: true, subscription });
  } catch (error) {
    console.error(`${LOG_PREFIX} Analytics failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to load usage" }, { status: 500 });
  }
}

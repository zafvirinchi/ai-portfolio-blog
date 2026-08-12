import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getActiveSubscription } from "@/lib/billing/subscription-service";
import { customerAnalyticsService } from "@/lib/analytics";

const LOG_PREFIX = "[customer-analytics]";

export async function GET(req: Request) {
  try {
    const identity = await customerAnalyticsService.resolveCustomerIdentity();

    if (!identity) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (!identity.organizationId) {
      return NextResponse.json({ hasOrganization: false });
    }

    console.log(`${LOG_PREFIX} Usage requested`, { userId: identity.userId, section: "features" });

    const subscription = await getActiveSubscription(identity.organizationId);
    const range = customerAnalyticsService.parseCustomerRangeFromSearchParams(new URL(req.url).searchParams, subscription);

    const features = await customerAnalyticsService.getMyFeatureUsage(identity.userId, identity.organizationId, range);

    console.log(`${LOG_PREFIX} Analytics completed`, { userId: identity.userId, section: "features" });

    return NextResponse.json({
      hasOrganization: true,
      range: { preset: range.preset, from: range.from.toISOString(), to: range.to.toISOString() },
      features,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    console.error(`${LOG_PREFIX} Analytics failed`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to load feature usage" }, { status: 500 });
  }
}

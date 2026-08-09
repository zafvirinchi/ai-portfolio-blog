import { NextResponse } from "next/server";

import * as activityService from "@/lib/saas/activity-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

export async function GET(req: Request) {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json({ error: "Not authenticated, or no active organization membership" }, { status: 401 });
  }

  const url = new URL(req.url);
  const activityType = url.searchParams.get("activityType") ?? undefined;
  const since = url.searchParams.get("since") ?? undefined;
  const until = url.searchParams.get("until") ?? undefined;

  const activity = await activityService.list({
    organizationId: context.organizationId,
    activityType,
    since,
    until,
  });

  return NextResponse.json(activity);
}

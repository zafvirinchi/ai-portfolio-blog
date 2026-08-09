import { NextResponse } from "next/server";

import { getSummary } from "@/lib/ai/usage/usage-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

export async function GET(req: Request) {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json({ totalCreditsUsed: 0, byFeature: [], byModel: [], byOperation: [], dailyUsage: [], estimatedCostCents: 0 });
  }

  const sinceDays = Number(new URL(req.url).searchParams.get("days") ?? "30") || 30;
  const summary = await getSummary(context.organizationId, sinceDays);

  return NextResponse.json(summary);
}

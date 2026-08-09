import { NextResponse } from "next/server";

import { listPlans, seedPlans } from "@/lib/billing/plan-service";

export async function GET() {
  try {
    await seedPlans();
  } catch (error) {
    // Table may not exist yet if the migration hasn't been run —
    // listPlans() below still returns the static PLAN_DEFINITIONS
    // fallback, so the page keeps working either way.
    console.error("[billing] Plan seeding skipped", error);
  }

  try {
    const plans = await listPlans();
    return NextResponse.json(plans);
  } catch (error) {
    console.error("[billing] Plans route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load plans" }, { status: 500 });
  }
}

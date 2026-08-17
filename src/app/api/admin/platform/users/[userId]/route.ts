import { NextResponse } from "next/server";

import { getPlatformUserDetail } from "@/lib/billing/platform-admin-service";
import { AdminAccessRequiredError, PlatformUnauthorizedError, requirePlatformAdmin } from "@/lib/billing/persona-service";

// Phase 18 Milestone 3 — Scope C/D/E. The full per-user admin view:
// roles, effective plans, every feature's resolved entitlement +
// source, override history, Stripe-backed billing state (degrades
// honestly if platform_subscriptions/platform_billing_customers are
// unreachable — see platform-subscription-service.ts's own fail-closed
// behavior; never fabricated), usage, and this user's own admin-action
// audit trail. The path param userId is the TARGET being looked up —
// never confused with the ACTING admin's own identity, which is always
// re-derived independently via requirePlatformAdmin().
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requirePlatformAdmin();

    const { userId } = await params;
    const detail = await getPlatformUserDetail(userId);

    if (!detail) {
      return NextResponse.json({ error: "No user exists with that id." }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof AdminAccessRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[admin/platform] User detail route failed", error);
    return NextResponse.json({ error: "Failed to load user detail." }, { status: 500 });
  }
}

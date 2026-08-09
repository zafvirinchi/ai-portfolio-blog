import { NextResponse } from "next/server";

import { getBalance } from "@/lib/ai/usage/usage-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

// Identity comes from the authenticated session only — never from the
// request — same discipline every M1-M3 route already follows.
export async function GET() {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json({ balance: null });
  }

  const balance = await getBalance(context.organizationId);

  return NextResponse.json({ balance });
}

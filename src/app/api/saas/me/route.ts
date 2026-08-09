import { NextResponse } from "next/server";

import { getTenantContext, listMyOrganizations } from "@/lib/saas/tenant-context";

export async function GET() {
  const [context, organizations] = await Promise.all([getTenantContext(), listMyOrganizations()]);

  return NextResponse.json({ context, organizations });
}

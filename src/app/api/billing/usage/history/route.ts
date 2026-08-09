import { NextResponse } from "next/server";

import { getHistory } from "@/lib/ai/usage/usage-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

export async function GET() {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json([]);
  }

  const history = await getHistory(context.organizationId, 100);

  return NextResponse.json(history);
}

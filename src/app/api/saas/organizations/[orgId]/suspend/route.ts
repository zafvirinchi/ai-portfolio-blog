import { NextResponse } from "next/server";

import { organizationService } from "@/lib/saas/organization-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

type Params = {
  params: Promise<{ orgId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { orgId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId || context.role !== "Owner") {
      return NextResponse.json({ error: "Only the organization owner can suspend it" }, { status: 403 });
    }

    const organization = await organizationService.suspend(orgId, req);

    return NextResponse.json(organization);
  } catch (error) {
    console.error("[organization] Organization suspend route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Suspending the organization failed" }, { status: 422 });
  }
}

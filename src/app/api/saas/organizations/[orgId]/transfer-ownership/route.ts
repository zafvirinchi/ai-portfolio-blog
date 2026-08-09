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
      return NextResponse.json({ error: "Only the current owner can transfer ownership" }, { status: 403 });
    }

    const { newOwnerId } = await req.json();

    if (typeof newOwnerId !== "string" || !newOwnerId) {
      return NextResponse.json({ error: "newOwnerId is required" }, { status: 400 });
    }

    const organization = await organizationService.transferOwnership(orgId, newOwnerId, req);

    return NextResponse.json(organization);
  } catch (error) {
    console.error("[organization] Transfer ownership route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Transferring ownership failed" }, { status: 422 });
  }
}

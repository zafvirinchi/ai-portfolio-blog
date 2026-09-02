import { NextResponse } from "next/server";

import { organizationUpdateSchema } from "@/lib/saas/organization-schema";
import { organizationService } from "@/lib/saas/organization-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

type Params = {
  params: Promise<{ orgId: string }>;
};

// Phase 26 Org/Workspace Auth Closure — genuine defect fix: this GET had
// NO authorization check at all, unlike every mutating sibling in this
// file (PATCH/DELETE below), which correctly gate on getTenantContext().
// Reachable by a fully unauthenticated caller who knew or guessed an
// orgId, exposing that organization's name/slug/status/owner_id.
export async function GET(_req: Request, { params }: Params) {
  const { orgId } = await params;

  const context = await getTenantContext();
  if (!context || context.organizationId !== orgId) {
    return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
  }

  const organization = await organizationService.get(orgId);

  if (!organization) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json(organization);
}

export async function PATCH(req: Request, { params }: Params) {
  const { orgId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId || (context.role !== "Owner" && context.role !== "Admin")) {
      return NextResponse.json({ error: "Not authorized to rename this organization" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = organizationUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const organization = await organizationService.rename(orgId, parsed.data.name, req);

    return NextResponse.json(organization);
  } catch (error) {
    console.error("[organization] Organization rename route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Organization rename failed" }, { status: 422 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { orgId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId || context.role !== "Owner") {
      return NextResponse.json({ error: "Only the organization owner can delete it" }, { status: 403 });
    }

    await organizationService.delete(orgId, req);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[organization] Organization delete route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Organization deletion failed" }, { status: 422 });
  }
}

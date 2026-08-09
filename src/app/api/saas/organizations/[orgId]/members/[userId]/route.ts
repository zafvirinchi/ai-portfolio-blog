import { NextResponse } from "next/server";

import { updateMemberRoleSchema } from "@/lib/saas/organization-schema";
import { membershipService } from "@/lib/saas/membership-service";
import { requirePermission, contextHasPermission } from "@/lib/saas/permission-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

type Params = {
  params: Promise<{ orgId: string; userId: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const { orgId, userId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId) {
      return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
    }

    requirePermission(context, "Manage Users");

    const body = await req.json();
    const parsed = updateMemberRoleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const member = await membershipService.updateRole(orgId, userId, parsed.data.role_key, req);

    return NextResponse.json(member);
  } catch (error) {
    console.error("[organization] Member role update route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Updating member role failed" }, { status: 422 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { orgId, userId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId) {
      return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
    }

    if (!contextHasPermission(context, "Manage Users") && context.userId !== userId) {
      return NextResponse.json({ error: "Missing required permission: Manage Users" }, { status: 403 });
    }

    await membershipService.removeMember(orgId, userId, req);

    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("[organization] Member remove route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Removing member failed" }, { status: 422 });
  }
}

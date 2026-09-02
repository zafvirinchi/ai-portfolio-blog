import { NextResponse } from "next/server";

import { updateRolePermissionsSchema } from "@/lib/saas/organization-schema";
import { listRoles, requirePermission, updateRolePermissions } from "@/lib/saas/permission-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

type Params = {
  params: Promise<{ orgId: string }>;
};

// Phase 26 Org/Workspace Auth Closure — genuine defect fix: this GET had
// NO authorization check at all, unlike PATCH below (same file), which
// correctly gates on getTenantContext(). Reachable by a fully
// unauthenticated caller, exposing an organization's role -> permission
// configuration for any orgId.
export async function GET(_req: Request, { params }: Params) {
  const { orgId } = await params;

  const context = await getTenantContext();
  if (!context || context.organizationId !== orgId) {
    return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
  }

  const roles = await listRoles(orgId);

  return NextResponse.json(roles);
}

export async function PATCH(req: Request, { params }: Params) {
  const { orgId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId) {
      return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
    }

    requirePermission(context, "Manage Users");

    const body = await req.json();
    const parsed = updateRolePermissionsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    await updateRolePermissions(orgId, parsed.data.role_key, parsed.data.permissions);

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("[organization] Role permissions update route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Updating role permissions failed" }, { status: 422 });
  }
}

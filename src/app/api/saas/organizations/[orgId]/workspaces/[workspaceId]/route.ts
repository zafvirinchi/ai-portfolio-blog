import { NextResponse } from "next/server";

import { workspaceUpdateSchema } from "@/lib/saas/organization-schema";
import { getTenantContext } from "@/lib/saas/tenant-context";
import { workspaceService } from "@/lib/saas/workspace-service";

type Params = {
  params: Promise<{ orgId: string; workspaceId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { workspaceId } = await params;
  const workspace = await workspaceService.get(workspaceId);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return NextResponse.json(workspace);
}

export async function PATCH(req: Request, { params }: Params) {
  const { orgId, workspaceId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId) {
      return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = workspaceUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const workspace = await workspaceService.update(workspaceId, parsed.data, req);

    return NextResponse.json(workspace);
  } catch (error) {
    console.error("[organization] Workspace update route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Workspace update failed" }, { status: 422 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { orgId, workspaceId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId) {
      return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
    }

    await workspaceService.delete(workspaceId, req);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[organization] Workspace delete route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Workspace deletion failed" }, { status: 422 });
  }
}

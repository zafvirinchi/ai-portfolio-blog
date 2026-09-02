import { NextResponse } from "next/server";

import { workspaceUpdateSchema } from "@/lib/saas/organization-schema";
import { getTenantContext } from "@/lib/saas/tenant-context";
import { workspaceService } from "@/lib/saas/workspace-service";

type Params = {
  params: Promise<{ orgId: string; workspaceId: string }>;
};

// Phase 26 Org/Workspace Auth Closure — genuine defect fix: this GET had
// NO authorization check at all — reachable by a fully unauthenticated
// caller who knew or guessed a workspaceId. Fixed with the same guard
// PATCH/DELETE below use, PLUS the resource-boundary check every handler
// in this file now applies (see the shared comment on PATCH below).
export async function GET(_req: Request, { params }: Params) {
  const { orgId, workspaceId } = await params;

  const context = await getTenantContext();
  if (!context || context.organizationId !== orgId) {
    return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
  }

  const workspace = await workspaceService.get(workspaceId);

  if (!workspace || workspace.organization_id !== orgId) {
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

    // Phase 26 Org/Workspace Auth Closure — genuine, critical defect fix:
    // workspaceService's update()/setStatus()/delete() (workspace-service.ts)
    // filter ONLY by workspace_id, never by organization_id — they trust
    // their caller entirely. This route (and DELETE/archive below) checked
    // only that the CALLER belongs to `orgId`, never that `workspaceId`
    // actually belongs to `orgId` — so a legitimate member of Org A could
    // rename/archive/delete Org B's workspace by supplying Org A's orgId
    // (to pass the tenant check above) alongside any known/guessed Org B
    // workspaceId. Fixed by fetching the workspace first and verifying its
    // organization_id matches the URL's orgId before any mutation — 404,
    // not 403, matching this repo's established "don't confirm existence
    // of a resource outside the caller's boundary" IDOR convention.
    const existing = await workspaceService.get(workspaceId);
    if (!existing || existing.organization_id !== orgId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
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

    // Phase 26 Org/Workspace Auth Closure — same cross-organization
    // resource-boundary fix as PATCH above.
    const existing = await workspaceService.get(workspaceId);
    if (!existing || existing.organization_id !== orgId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    await workspaceService.delete(workspaceId, req);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("[organization] Workspace delete route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Workspace deletion failed" }, { status: 422 });
  }
}

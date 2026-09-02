import { NextResponse } from "next/server";

import { MEMBER_ROLES } from "@/lib/saas/organization-schema";
import { membershipService } from "@/lib/saas/membership-service";
import { contextHasPermission, requirePermission } from "@/lib/saas/permission-service";
import { getTenantContext } from "@/lib/saas/tenant-context";
import { workspaceService } from "@/lib/saas/workspace-service";

type Params = {
  params: Promise<{ orgId: string; workspaceId: string }>;
};

// Phase 26 Milestone 1 — genuine defect fix: this GET had NO authorization
// check at all — reachable by a fully unauthenticated caller who knew or
// guessed an orgId/workspaceId, exposing another organization's workspace
// membership (user ids + roles). Fixed with the same guard POST/DELETE
// below already use.
export async function GET(_req: Request, { params }: Params) {
  const { orgId, workspaceId } = await params;

  const context = await getTenantContext();
  if (!context || context.organizationId !== orgId) {
    return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
  }

  // Phase 26 Org/Workspace Auth Closure — genuine, critical defect fix:
  // this route (and POST/DELETE below) checked only that the CALLER
  // belongs to orgId, never that workspaceId actually belongs to orgId —
  // membershipService's addToWorkspace/removeFromWorkspace/
  // listWorkspaceMembers all trust workspaceId alone. A legitimate member
  // of Org A could view or, worse, add/remove members of Org B's
  // workspace by supplying Org A's orgId (to pass the check above)
  // alongside any known/guessed Org B workspaceId. Fixed by verifying the
  // workspace's own organization_id before proceeding — 404, not 403,
  // matching this repo's established IDOR convention.
  const workspace = await workspaceService.get(workspaceId);
  if (!workspace || workspace.organization_id !== orgId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const members = await membershipService.listWorkspaceMembers(workspaceId);

  return NextResponse.json(members);
}

export async function POST(req: Request, { params }: Params) {
  const { orgId, workspaceId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId) {
      return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
    }

    // Phase 26 Milestone 1 — genuine defect fix: this route checked only
    // organization membership (any tenant match), never a permission —
    // unlike the identical action at the organization level
    // ([orgId]/members/[userId]/route.ts's PATCH), which requires "Manage
    // Users". Net effect before this fix: every member of an org, regardless
    // of role, could add any other member to any workspace in that org,
    // including assigning an arbitrary role. Fixed with the same
    // permission check the org-level sibling route already uses.
    requirePermission(context, "Manage Users");

    // Phase 26 Org/Workspace Auth Closure — cross-organization
    // resource-boundary fix, see GET above for the full explanation.
    const workspace = await workspaceService.get(workspaceId);
    if (!workspace || workspace.organization_id !== orgId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const { userId, role_key } = await req.json();

    if (typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (!MEMBER_ROLES.includes(role_key)) {
      return NextResponse.json({ error: `role_key must be one of: ${MEMBER_ROLES.join(", ")}` }, { status: 400 });
    }

    const member = await membershipService.addToWorkspace(workspaceId, userId, role_key, req);

    return NextResponse.json(member);
  } catch (error) {
    console.error("[organization] Workspace member add route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Adding workspace member failed" }, { status: 422 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { orgId, workspaceId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId) {
      return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
    }

    // Phase 26 Org/Workspace Auth Closure — cross-organization
    // resource-boundary fix, see GET above for the full explanation.
    const workspace = await workspaceService.get(workspaceId);
    if (!workspace || workspace.organization_id !== orgId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId query param is required" }, { status: 400 });
    }

    // Phase 26 Milestone 1 — genuine defect fix: same missing-permission
    // issue as POST above. Mirrors the org-level sibling's DELETE
    // (members/[userId]/route.ts): a member can remove themselves from a
    // workspace, but removing someone else requires "Manage Users".
    if (!contextHasPermission(context, "Manage Users") && context.userId !== userId) {
      return NextResponse.json({ error: "Missing required permission: Manage Users" }, { status: 403 });
    }

    await membershipService.removeFromWorkspace(workspaceId, userId, req);

    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("[organization] Workspace member remove route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Removing workspace member failed" }, { status: 422 });
  }
}

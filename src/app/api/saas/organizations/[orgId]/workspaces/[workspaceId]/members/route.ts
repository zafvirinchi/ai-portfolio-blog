import { NextResponse } from "next/server";

import { MEMBER_ROLES } from "@/lib/saas/organization-schema";
import { membershipService } from "@/lib/saas/membership-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

type Params = {
  params: Promise<{ orgId: string; workspaceId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { workspaceId } = await params;
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

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId query param is required" }, { status: 400 });
    }

    await membershipService.removeFromWorkspace(workspaceId, userId, req);

    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("[organization] Workspace member remove route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Removing workspace member failed" }, { status: 422 });
  }
}

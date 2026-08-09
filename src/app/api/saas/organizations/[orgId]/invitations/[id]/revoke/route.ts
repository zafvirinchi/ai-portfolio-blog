import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/saas/permission-service";
import { membershipService } from "@/lib/saas/membership-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

type Params = {
  params: Promise<{ orgId: string; id: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { orgId, id } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId) {
      return NextResponse.json({ error: "Not authenticated, or no active organization membership" }, { status: 401 });
    }

    requirePermission(context, "Manage Users");

    const invitations = await membershipService.listInvitations(orgId);

    if (!invitations.some((invitation) => invitation.id === id)) {
      return NextResponse.json({ error: "Invitation not found in this organization" }, { status: 404 });
    }

    const invitation = await membershipService.revoke(id, req);

    return NextResponse.json(invitation);
  } catch (error) {
    console.error("[organization] Invitation revoke route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Revoking the invitation failed" }, { status: 422 });
  }
}

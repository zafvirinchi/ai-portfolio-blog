import { NextResponse } from "next/server";

import { inviteMemberSchema } from "@/lib/saas/organization-schema";
import { membershipService } from "@/lib/saas/membership-service";
import { requirePermission } from "@/lib/saas/permission-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

type Params = {
  params: Promise<{ orgId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { orgId } = await params;
  const invitations = await membershipService.listInvitations(orgId);

  return NextResponse.json(invitations);
}

export async function POST(req: Request, { params }: Params) {
  const { orgId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId) {
      return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
    }

    requirePermission(context, "Manage Users");

    const body = await req.json();
    const parsed = inviteMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const invitation = await membershipService.invite(orgId, parsed.data.email, parsed.data.role_key, context.userId, req);

    // No email provider is configured in this project (design decision
    // 5) — the accept link is returned directly for the UI to surface/
    // copy, rather than assuming delivery succeeded.
    return NextResponse.json({ ...invitation, acceptUrl: `/invite/${invitation.token}` });
  } catch (error) {
    console.error("[organization] Invitation creation route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Creating the invitation failed" }, { status: 422 });
  }
}

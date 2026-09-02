import { NextResponse } from "next/server";

import { inviteMemberSchema } from "@/lib/saas/organization-schema";
import { membershipService } from "@/lib/saas/membership-service";
import { requirePermission } from "@/lib/saas/permission-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

type Params = {
  params: Promise<{ orgId: string }>;
};

// Phase 26 Org/Workspace Auth Closure — genuine, critical defect fix:
// this GET had NO authorization check at all, unlike POST below (same
// file), which correctly gates on getTenantContext() + requirePermission.
// OrganizationInvitation includes the raw `token` field (organization-
// types.ts) — the bearer secret that /api/saas/invitations/[token]/accept
// accepts from ANY authenticated user, with no check that the accepting
// user's email matches the invitation's. Before this fix, an
// unauthenticated caller who knew or guessed an orgId could list every
// pending invitation for that org — email AND token included — then use
// any harvested token to join that organization at the invited role.
// This is a full, unauthenticated organization-infiltration chain, not
// merely an information leak. Fixed with the same guard the sibling POST
// already uses.
export async function GET(_req: Request, { params }: Params) {
  const { orgId } = await params;

  const context = await getTenantContext();
  if (!context || context.organizationId !== orgId) {
    return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
  }

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

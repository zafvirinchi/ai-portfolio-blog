import { NextResponse } from "next/server";

import { membershipService } from "@/lib/saas/membership-service";
import { organizationService } from "@/lib/saas/organization-service";

type Params = {
  params: Promise<{ token: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  const invitation = await membershipService.getInvitationByToken(token);

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  const organization = await organizationService.get(invitation.organization_id);

  return NextResponse.json({ invitation, organization });
}

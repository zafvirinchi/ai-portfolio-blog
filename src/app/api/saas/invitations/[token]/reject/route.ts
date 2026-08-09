import { NextResponse } from "next/server";

import { membershipService } from "@/lib/saas/membership-service";

type Params = {
  params: Promise<{ token: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { token } = await params;

  try {
    const invitation = await membershipService.reject(token, req);

    return NextResponse.json(invitation);
  } catch (error) {
    console.error("[organization] Invitation reject route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Rejecting the invitation failed" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";

import { ACTIVE_ORG_COOKIE_NAME, verifyMembership } from "@/lib/saas/tenant-context";

export async function POST(req: Request) {
  try {
    const { organizationId } = await req.json();

    if (typeof organizationId !== "string" || !organizationId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    const isMember = await verifyMembership(organizationId);

    if (!isMember) {
      return NextResponse.json({ error: "You are not a member of that organization" }, { status: 403 });
    }

    const response = NextResponse.json({ organizationId });

    response.cookies.set(ACTIVE_ORG_COOKIE_NAME, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    console.error("[organization] Organization switch route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Switching organization failed" }, { status: 422 });
  }
}

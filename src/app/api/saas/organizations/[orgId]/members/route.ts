import { NextResponse } from "next/server";

import { getTeamRoster } from "@/lib/saas/team-service";

type Params = {
  params: Promise<{ orgId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { orgId } = await params;
  const roster = await getTeamRoster(orgId);

  return NextResponse.json(roster);
}

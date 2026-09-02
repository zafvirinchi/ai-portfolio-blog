import { NextResponse } from "next/server";

import { getTeamRoster } from "@/lib/saas/team-service";
import { getTenantContext } from "@/lib/saas/tenant-context";

type Params = {
  params: Promise<{ orgId: string }>;
};

// Phase 26 Milestone 1 — genuine defect fix: this GET had NO authorization
// check at all (unlike every sibling mutating route in this same
// organization/members/workspace tree, which all check
// `getTenantContext()` + `context.organizationId !== orgId` before acting —
// see [orgId]/members/[userId]/route.ts). getTeamRoster() resolves each
// member's real email address (team-service.ts's resolveEmail()), so this
// was reachable by a fully unauthenticated caller who simply knew or
// guessed an orgId, exposing another organization's full roster
// (user ids, emails, roles) — a real, unauthenticated, cross-tenant PII
// leak, not a UI-only gap. Fixed with the exact same guard every other
// route in this tree already uses; no new authorization mechanism.
export async function GET(_req: Request, { params }: Params) {
  const { orgId } = await params;

  const context = await getTenantContext();
  if (!context || context.organizationId !== orgId) {
    return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
  }

  const roster = await getTeamRoster(orgId);

  return NextResponse.json(roster);
}

import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/saas/tenant-context";
import { workspaceService } from "@/lib/saas/workspace-service";

type Params = {
  params: Promise<{ orgId: string; workspaceId: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { orgId, workspaceId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId) {
      return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const workspace = body?.reactivate ? await workspaceService.reactivate(workspaceId, req) : await workspaceService.archive(workspaceId, req);

    return NextResponse.json(workspace);
  } catch (error) {
    console.error("[organization] Workspace archive route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Archiving the workspace failed" }, { status: 422 });
  }
}

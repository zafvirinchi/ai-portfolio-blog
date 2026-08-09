import { NextResponse } from "next/server";

import { workspaceCreateSchema } from "@/lib/saas/organization-schema";
import { getTenantContext } from "@/lib/saas/tenant-context";
import { workspaceService } from "@/lib/saas/workspace-service";

type Params = {
  params: Promise<{ orgId: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { orgId } = await params;
  const workspaces = await workspaceService.list(orgId);

  return NextResponse.json(workspaces);
}

export async function POST(req: Request, { params }: Params) {
  const { orgId } = await params;

  try {
    const context = await getTenantContext();

    if (!context || context.organizationId !== orgId) {
      return NextResponse.json({ error: "Not authorized for this organization" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = workspaceCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const workspace = await workspaceService.create(orgId, parsed.data, context.userId, req);

    return NextResponse.json(workspace);
  } catch (error) {
    console.error("[organization] Workspace creation route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Workspace creation failed" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { organizationCreateSchema } from "@/lib/saas/organization-schema";
import { organizationService } from "@/lib/saas/organization-service";
import { listMyOrganizations } from "@/lib/saas/tenant-context";

export async function GET() {
  const organizations = await listMyOrganizations();
  return NextResponse.json(organizations);
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = organizationCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const existing = await organizationService.getBySlug(parsed.data.slug);

    if (existing) {
      return NextResponse.json({ error: "That organization slug is already taken" }, { status: 409 });
    }

    const organization = await organizationService.create(parsed.data, user.id, req);

    return NextResponse.json(organization);
  } catch (error) {
    console.error("[organization] Organization creation route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Organization creation failed" }, { status: 422 });
  }
}

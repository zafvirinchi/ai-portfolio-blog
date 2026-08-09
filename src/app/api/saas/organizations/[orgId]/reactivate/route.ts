import { NextResponse } from "next/server";

import { organizationService } from "@/lib/saas/organization-service";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ orgId: string }>;
};

// Deliberately does NOT use getTenantContext() — a suspended org makes
// getTenantContext() resolve to null for every member, including the
// owner, since it blocks all access to a suspended org by design. The
// one way out of suspension has to check membership/role directly.
export async function POST(req: Request, { params }: Params) {
  const { orgId } = await params;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("role_key")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || membership.role_key !== "Owner") {
      return NextResponse.json({ error: "Only the organization owner can reactivate it" }, { status: 403 });
    }

    const organization = await organizationService.reactivate(orgId, req);

    return NextResponse.json(organization);
  } catch (error) {
    console.error("[organization] Organization reactivate route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Reactivating the organization failed" }, { status: 422 });
  }
}

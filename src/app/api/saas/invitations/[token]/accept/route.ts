import { NextResponse } from "next/server";

import { membershipService } from "@/lib/saas/membership-service";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type Params = {
  params: Promise<{ token: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { token } = await params;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "You must be logged in to accept an invitation" }, { status: 401 });
    }

    const invitation = await membershipService.accept(token, user.id, req);

    return NextResponse.json(invitation);
  } catch (error) {
    console.error("[organization] Invitation accept route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Accepting the invitation failed" }, { status: 422 });
  }
}

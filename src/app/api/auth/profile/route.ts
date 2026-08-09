import { NextResponse } from "next/server";

import { profileUpdateSchema } from "@/lib/auth/auth-schema";
import { deleteAccount } from "@/lib/auth/auth-service";
import { getLinkedIdentities } from "@/lib/auth/oauth-service";
import { requireAuthContext } from "@/lib/auth/permission-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const context = await requireAuthContext();
    const supabase = await createSupabaseRouteClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const metadata = (user?.user_metadata as Record<string, unknown> | undefined) ?? {};
    const identities = await getLinkedIdentities(supabase);

    return NextResponse.json({
      id: context.userId,
      email: context.email,
      displayName: typeof metadata.display_name === "string" ? metadata.display_name : null,
      createdAt: user?.created_at ?? null,
      identities,
    });
  } catch (error) {
    console.error("[auth] Profile GET route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load profile" }, { status: 422 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAuthContext();
    const body = profileUpdateSchema.parse(await req.json());

    const supabase = await createSupabaseRouteClient();
    const { error } = await supabase.auth.updateUser({ data: { display_name: body.displayName } });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth] Profile PATCH route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 422 });
  }
}

export async function DELETE() {
  try {
    const context = await requireAuthContext();
    await deleteAccount(context.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth] Profile DELETE route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "Account deletion failed" }, { status: 422 });
  }
}

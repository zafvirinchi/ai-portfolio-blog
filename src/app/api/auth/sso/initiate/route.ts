import { NextResponse } from "next/server";

import { ssoInitiateSchema } from "@/lib/auth/auth-schema";
import { verifySameOrigin } from "@/lib/auth/security-service";
import { initiate } from "@/lib/auth/sso-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    if (!verifySameOrigin(req)) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }

    const body = ssoInitiateSchema.parse(await req.json());

    const supabase = await createSupabaseRouteClient();
    const { data, error } = await initiate(supabase, body.domain);

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "No SSO provider is configured for this domain yet." }, { status: 422 });
    }

    return NextResponse.json({ url: data.url });
  } catch (error) {
    console.error("[auth] SSO initiate route failed", error);

    return NextResponse.json({ error: error instanceof Error ? error.message : "SSO initiation failed" }, { status: 422 });
  }
}

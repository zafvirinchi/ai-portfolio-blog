import { NextResponse } from "next/server";

import { finalizeLogin } from "@/lib/auth/auth-service";
import { createSupabaseRouteClient } from "@/lib/supabase-server";

// Standard Supabase Next.js OAuth/SSO/magic-link/password-recovery
// redirect target — exchanges the PKCE `code` for a real session via
// createSupabaseRouteClient() (the one Supabase client in this repo
// whose cookie writes actually persist, since this is a Route Handler).
// A password-recovery code lands here too (redirect=/reset-password) —
// finalizeLogin() still runs, which is fine: the user is genuinely
// re-authenticating.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const explicitRedirect = url.searchParams.get("redirect");

  if (code) {
    const supabase = await createSupabaseRouteClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // OAuth/SSO logins are treated as already strongly authenticated
      // by the external IdP — no additional TOTP challenge here, unlike
      // the email+password flow in auth-service.ts's login().
      const { defaultLandingPath } = await finalizeLogin(req, data.user.id);

      return NextResponse.redirect(new URL(explicitRedirect || defaultLandingPath, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", url.origin));
}

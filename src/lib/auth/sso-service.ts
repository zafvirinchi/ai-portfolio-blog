import type { SupabaseClient } from "@supabase/supabase-js";

// Enterprise SSO (OIDC/SAML via Azure AD, Google Workspace, Okta,
// Auth0, ...) — real Supabase Auth API (signInWithSSO), code-ready.
// Actually *configuring* an SSO provider for a specific domain requires
// Supabase's Management API/CLI (`supabase sso add ...`), which is not
// available in this environment (no CLI/MCP tool). This is exactly the
// spec's own "SAML (future-ready architecture)" framing: the calling
// code below is real and will work the moment a provider is registered
// for the domain the user enters — until then, initiate() surfaces
// Supabase's own "No SSO provider assigned for this domain" error.

const SSO_CALLBACK_PATH = "/auth/callback";

export async function initiate(supabase: SupabaseClient, domain: string, redirectTo?: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callbackUrl = `${origin}${SSO_CALLBACK_PATH}${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`;

  return supabase.auth.signInWithSSO({
    domain,
    options: { redirectTo: callbackUrl },
  });
}

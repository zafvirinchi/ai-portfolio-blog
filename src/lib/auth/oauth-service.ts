import type { SupabaseClient, UserIdentity } from "@supabase/supabase-js";

import { OAUTH_PROVIDERS, OAuthProviderId } from "./auth-schema";
import { LinkedIdentity } from "./auth-types";

// Real Supabase Auth OAuth, code-ready for all 4 providers the spec
// names (Azure = Microsoft's OIDC provider id in Supabase). Each
// provider only becomes actually usable once its Client ID/Secret are
// configured in the Supabase project dashboard (Authentication →
// Providers) — no CLI/MCP tool is available in this environment to do
// that myself, same posture as Milestone 1's migration file. Takes the
// SupabaseClient as a parameter (rather than constructing one itself)
// so it works from any client component that already has one, exactly
// like LoginForm.tsx's existing signInWithPassword() call pattern.

const OAUTH_CALLBACK_PATH = "/auth/callback";

export function isSupportedProvider(provider: string): provider is OAuthProviderId {
  return (OAUTH_PROVIDERS as readonly string[]).includes(provider);
}

export async function signInWithOAuth(supabase: SupabaseClient, provider: OAuthProviderId, redirectTo?: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callbackUrl = `${origin}${OAUTH_CALLBACK_PATH}${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`;

  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl },
  });
}

export async function getLinkedIdentities(supabase: SupabaseClient): Promise<LinkedIdentity[]> {
  const { data, error } = await supabase.auth.getUserIdentities();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.identities ?? []).map((identity) => ({
    id: identity.identity_id ?? identity.id,
    provider: identity.provider,
    createdAt: identity.created_at ?? null,
  }));
}

export async function unlinkIdentity(supabase: SupabaseClient, identity: UserIdentity): Promise<void> {
  const { error } = await supabase.auth.unlinkIdentity(identity);

  if (error) {
    throw new Error(error.message);
  }
}

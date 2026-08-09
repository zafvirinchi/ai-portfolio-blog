import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "../supabase-server";

import { AUTH_SESSION_COOKIE_NAME } from "./session-service";
import { AuthContext } from "./auth-types";

// Populated by /api/ai/chat/route.ts directly from the Supabase session
// (independent of organization membership, unlike saas/tenant-context.ts's
// organizationRequestContext) so chat's "show my sessions"/"when did I
// last log in" questions work even for a user who hasn't joined an org
// yet.
export const authRequestContext = new AsyncLocalStorage<{ userId: string; email: string | null }>();

// Route-guard helpers — distinct from rbac-service.ts (raw role/
// permission lookups delegated to the Organization Module) and from
// src/lib/saas/permission-service.ts (different package, no import
// collision since nothing re-exports both flatly from one barrel).

/** Resolves identity directly from the Supabase session — independent of organization membership, unlike saas/TenantContext, so it also resolves for a user who hasn't joined an org yet. */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value ?? null;

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  return {
    userId: user.id,
    email: user.email ?? null,
    sessionId,
    mfaVerified: aal?.currentLevel === "aal2",
  };
}

export async function requireAuthContext(): Promise<AuthContext> {
  const context = await getAuthContext();

  if (!context) {
    throw new Error("Not authenticated.");
  }

  return context;
}

export function requireMfaVerified(context: AuthContext): void {
  if (!context.mfaVerified) {
    throw new Error("This action requires MFA verification.");
  }
}

import { createSupabaseServerClient } from "../../supabase-server";

/**
 * Phase 16 Milestone 2 — recruiter identity is server-derived from the
 * Supabase Auth session only, exactly like resume-version-auth.ts's
 * requireUserId(). Deliberately NOT routed through getTenantContext()
 * (src/lib/saas/tenant-context.ts): that helper resolves an
 * organization membership, and this milestone's own scope (§4) is an
 * individual-recruiter-scoped workspace, not an organization-shared
 * one — a recruiter's candidates/JD belong to their own auth.users id,
 * never to a whole organization.
 */
export class UnauthorizedError extends Error {
  constructor() {
    super("You must be signed in to use the Recruiter Workspace.");
    this.name = "UnauthorizedError";
  }
}

export async function requireRecruiterId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError();
  }

  return user.id;
}

/** Non-throwing variant for callers (chat tool context) that need to degrade gracefully instead of failing the whole request when unauthenticated. */
export async function getRecruiterId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

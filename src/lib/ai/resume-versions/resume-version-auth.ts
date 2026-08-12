import { createSupabaseServerClient } from "../../supabase-server";

/** Thrown by requireUserId() when there is no session — every route's error handler maps this to HTTP 401, distinct from the generic 422 fallback used for unexpected failures. */
export class UnauthorizedError extends Error {
  constructor() {
    super("You must be signed in to manage resume versions.");
    this.name = "UnauthorizedError";
  }
}

/**
 * The one place every /api/ai/resume/versions* route resolves identity
 * — a real Supabase session, never a userId read from the request body
 * or a query parameter. Resume versions are personal, not
 * organization-scoped (unlike Phase 14's tenant-context.ts), so this
 * intentionally doesn't go through getTenantContext() — a logged-in
 * user with no organization (or none of this SaaS platform's
 * organization concepts at all) can still have resume versions.
 */
export async function requireUserId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new UnauthorizedError();
  }

  return user.id;
}

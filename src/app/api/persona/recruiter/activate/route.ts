import { NextResponse } from "next/server";

import { activateRecruiterPersona, PlatformUnauthorizedError, requireUserId } from "@/lib/billing/persona-service";

// Phase 23 Milestone 3 — audit finding: there was no self-service way to
// ever acquire the RECRUITER platform role (see activateRecruiterPersona()'s
// own doc comment in persona-service.ts for the full trace). This route
// is the one, deliberately narrow fix: userId is always the caller's own
// session (requireUserId()), never a request body/query parameter, and
// the role granted is hardcoded to RECRUITER — this can never be used to
// self-grant ADMIN or act on another user's account.
export async function POST() {
  try {
    const { userId } = await requireUserId();
    const roles = await activateRecruiterPersona(userId);

    return NextResponse.json({ roles });
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("[persona] Recruiter activation failed", error);
    return NextResponse.json({ error: "Failed to activate the Recruiter Workspace" }, { status: 422 });
  }
}

import { NextResponse } from "next/server";

import { searchPlatformUsers } from "@/lib/billing/platform-admin-service";
import { AdminAccessRequiredError, PlatformUnauthorizedError, requirePlatformAdmin } from "@/lib/billing/persona-service";

// Phase 18 Milestone 3 — Scope A. Admin-only user search. userId/email/
// role are read from the query string as SEARCH INPUT only — never
// trusted as proof of who's asking. The acting caller's own identity
// and ADMIN status are independently re-derived from their real
// Supabase session on every request (requirePlatformAdmin()).
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();

    const url = new URL(req.url);
    const email = url.searchParams.get("email") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    const role = url.searchParams.get("role") ?? undefined;

    const results = await searchPlatformUsers({ email, userId, role });
    return NextResponse.json({ users: results });
  } catch (error) {
    if (error instanceof PlatformUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof AdminAccessRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[admin/platform] User search route failed", error);
    return NextResponse.json({ error: "User search failed." }, { status: 500 });
  }
}

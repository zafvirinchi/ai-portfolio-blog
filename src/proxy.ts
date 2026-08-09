import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { AUTH_SESSION_COOKIE_NAME, touch } from "@/lib/auth/session-service";

// Phase 14 Milestone 2 — first Proxy file in this repo (Next.js 16
// renamed "Middleware" to "Proxy"; `middleware.ts` is deprecated here in
// favor of this file, see node_modules/next/dist/docs/01-app/03-api-
// reference/03-file-conventions/proxy.md). Its only job is refreshing
// the Supabase session cookie on every navigation — fixes the pre-
// existing gap where src/lib/supabase-server.ts's createSupabaseServerClient()
// has a documented cookie-write no-op (Server Components can't write
// cookies), so a server-refreshed token was previously never persisted
// back to the browser. Pure passthrough otherwise; no existing route's
// behavior changes.
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sessionId = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value;

  if (user && sessionId) {
    event.waitUntil(touch(sessionId));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|api/).*)"],
};

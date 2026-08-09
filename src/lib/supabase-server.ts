import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Do nothing here.
          // Cookies cannot be modified inside Server Components/layouts.
        },
      },
    }
  );
}

// Phase 14 Milestone 2 — Route Handlers (unlike Server Components/
// layouts) CAN write cookies, so auth routes that need the resulting
// Supabase session actually persisted to the browser (login, register,
// logout, MFA verify, the OAuth/SSO callback) use this client instead
// of createSupabaseServerClient() above, which every existing caller
// keeps using unchanged.
export async function createSupabaseRouteClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
}
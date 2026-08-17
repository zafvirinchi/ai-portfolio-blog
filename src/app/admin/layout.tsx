import Link from "next/link";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import LogoutButton from "@/components/admin/LogoutButton";
import { isAdmin, resolvePlatformRoles } from "@/lib/billing/persona-service";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Phase 18 Milestone 4, Step 2 — this used to only check that a session
// existed (no role check at all), documented as a gap in Phase 17 M7
// and left unfixed through Phase 18 M1/M3 on purpose: fixing it without
// a working bootstrap path would have locked the site owner out of the
// entire CMS, since no user has ever held the ADMIN persona before this
// milestone (see PHASE18_MILESTONE4's own report for the bootstrap
// mechanism this fix depends on). The whole /admin/** tree — blogs,
// interview content, RAG knowledge base, SaaS/billing/usage dashboards,
// the M3 platform control plane — is a single site-owner-only surface;
// nothing under it has ever had a distinct, less-privileged audience.
// Reuses the same requirePlatformAdmin() building blocks
// (resolvePlatformRoles/isAdmin) every /admin/platform/** route already
// uses (Phase 18 M3) — no second role-resolution implementation.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const roles = await resolvePlatformRoles(user.id);

  if (!isAdmin(roles)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <h1 className="text-xl font-bold text-red-900">Access Denied</h1>
          <p className="mt-2 text-sm text-red-800">
            This area requires administrator access. Your account ({user.email}) doesn&apos;t currently have it.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-blue-600">
            Return to the website
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <Link href="/admin" className="text-xl font-bold text-slate-900">
              Admin Panel
            </Link>
            <p className="text-xs text-slate-500">Content Management System</p>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-600 md:inline">
              {user.email}
            </span>

            <Link href="/" className="text-sm font-medium text-blue-600">
              Website
            </Link>

            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[260px_1fr]">
        <AdminSidebar />

        <main>{children}</main>
      </div>
    </div>
  );
}
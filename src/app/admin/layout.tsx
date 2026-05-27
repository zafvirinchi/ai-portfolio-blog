import Link from "next/link";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import LogoutButton from "@/components/admin/LogoutButton";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
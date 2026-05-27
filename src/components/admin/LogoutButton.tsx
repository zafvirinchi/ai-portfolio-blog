"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
    >
      Logout
    </button>
  );
}
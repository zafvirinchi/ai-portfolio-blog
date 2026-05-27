"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function AdminLoginForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    const email = String(formData.get("email"));
    const password = String(formData.get("password"));

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={handleLogin} className="mt-8 space-y-5">
      <input
        name="email"
        type="email"
        required
        placeholder="Admin email"
        className="w-full rounded-xl border px-4 py-3"
      />

      <input
        name="password"
        type="password"
        required
        placeholder="Password"
        className="w-full rounded-xl border px-4 py-3"
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50"
      >
        {loading ? "Logging in..." : "Login"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
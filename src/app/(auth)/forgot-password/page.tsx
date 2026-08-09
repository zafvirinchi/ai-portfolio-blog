"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-4xl font-bold">Reset Password</h1>
      <p className="mt-4 text-gray-600">Enter your email and we&apos;ll send you a reset link.</p>

      {sent ? (
        <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          If an account exists for that email, a reset link has been sent.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <input name="email" type="email" required placeholder="Email" className="w-full rounded-xl border px-4 py-3" />

          <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50">
            {loading ? "Sending..." : "Send Reset Link"}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      <p className="mt-6 text-sm text-slate-600">
        <Link href="/login" className="font-semibold text-blue-600">
          Back to log in
        </Link>
      </p>
    </section>
  );
}

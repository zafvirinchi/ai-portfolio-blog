"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function VerifyEmailPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));

    try {
      const response = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Resend failed");
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-4xl font-bold">Verify Your Email</h1>
      <p className="mt-4 text-gray-600">
        Check your inbox for a confirmation link. Didn&apos;t get it? Request a new one below.
      </p>

      {sent ? (
        <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Confirmation email resent — check your inbox.
        </div>
      ) : (
        <form onSubmit={handleResend} className="mt-8 space-y-5">
          <input name="email" type="email" required placeholder="Email" className="w-full rounded-xl border px-4 py-3" />

          <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50">
            {loading ? "Sending..." : "Resend Confirmation Email"}
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

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function policyChecklist(password: string) {
  return [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "An uppercase letter", met: /[A-Z]/.test(password) },
    { label: "A lowercase letter", met: /[a-z]/.test(password) },
    { label: "A number", met: /[0-9]/.test(password) },
    { label: "A special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Reset failed");
      }

      setDone(true);
      setTimeout(() => router.push("/settings/organization"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <section className="mx-auto max-w-md px-6 py-20">
        <h1 className="text-4xl font-bold">Password Updated</h1>
        <p className="mt-4 text-gray-600">Redirecting...</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-4xl font-bold">Set a New Password</h1>
      <p className="mt-4 text-gray-600">
        If you followed a valid reset link, you&apos;re now signed in with a recovery session — choose a new password below.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password"
            className="w-full rounded-xl border px-4 py-3"
          />
          <ul className="mt-2 space-y-1 text-xs">
            {policyChecklist(password).map((rule) => (
              <li key={rule.label} className={rule.met ? "text-green-600" : "text-slate-400"}>
                {rule.met ? "✓" : "○"} {rule.label}
              </li>
            ))}
          </ul>
        </div>

        <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-medium text-white disabled:opacity-50">
          {loading ? "Updating..." : "Update Password"}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </section>
  );
}

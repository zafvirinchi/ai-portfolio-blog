"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  token: string;
  status: string;
};

export default function InviteActions({ token, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handle(action: "accept" | "reject") {
    setBusy(action);
    setError(null);

    try {
      const response = await fetch(`/api/saas/invitations/${token}/${action}`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setResult(action === "accept" ? "Invitation accepted! Redirecting..." : "Invitation declined.");

      if (action === "accept") {
        setTimeout(() => router.push("/settings/organization"), 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  if (status !== "pending") {
    return <p className="mt-6 text-sm text-slate-500">This invitation is {status}.</p>;
  }

  if (result) {
    return <p className="mt-6 text-sm text-green-700">{result}</p>;
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex gap-3">
        <button
          onClick={() => handle("accept")}
          disabled={busy !== null}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy === "accept" ? "Accepting..." : "Accept"}
        </button>
        <button
          onClick={() => handle("reject")}
          disabled={busy !== null}
          className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "reject" ? "Declining..." : "Reject"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

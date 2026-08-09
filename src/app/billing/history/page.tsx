"use client";

import { useEffect, useState } from "react";

import type { UsageTrackingEntry } from "@/lib/billing/billing-types";

export default function BillingHistoryPage() {
  const [entries, setEntries] = useState<UsageTrackingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/billing/history")
      .then((response) => response.json())
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {entries.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">No usage recorded yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Feature</th>
              <th className="px-5 py-3">Credits</th>
              <th className="px-5 py-3">Duration</th>
              <th className="px-5 py-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-5 py-3 font-semibold text-slate-800">{entry.feature_key.toString().replace(/_/g, " ")}</td>
                <td className="px-5 py-3 text-slate-600">{entry.credits_consumed}</td>
                <td className="px-5 py-3 text-slate-600">{entry.duration_ms ? `${entry.duration_ms}ms` : "—"}</td>
                <td className="px-5 py-3 text-slate-600">{new Date(entry.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

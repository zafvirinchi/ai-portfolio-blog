"use client";

import { useEffect, useState } from "react";

import type { AuditLogEntry } from "@/lib/saas/organization-types";

export default function AuditSettingsPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/saas/audit");
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || "Loading the audit log failed");

        setEntries(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Loading the audit log failed.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

  return (
    <div className="space-y-2">
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No security-relevant actions recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Object</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Browser</th>
                <th className="px-4 py-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{entry.action}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {entry.object_type ?? "—"} {entry.object_id ? `(${entry.object_id.slice(0, 8)})` : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{entry.user_id ? entry.user_id.slice(0, 8) : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.ip_address ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.user_agent ? entry.user_agent.slice(0, 40) : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(entry.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

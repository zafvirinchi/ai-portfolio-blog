"use client";

import { useCallback, useEffect, useState } from "react";

import { MEMBER_ROLES } from "@/lib/saas/organization-schema";
import type { TeamRosterEntry, TenantContext } from "@/lib/saas/organization-types";

export default function TeamSettingsPage() {
  const [context, setContext] = useState<TenantContext | null>(null);
  const [roster, setRoster] = useState<TeamRosterEntry[]>([]);
  const [search, setSearch] = useState("");
  const [transferUserId, setTransferUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const meResponse = await fetch("/api/saas/me");
      const me = await meResponse.json();
      setContext(me.context);

      if (!me.context) return;

      const rosterResponse = await fetch(`/api/saas/organizations/${me.context.organizationId}/members`);
      setRoster(await rosterResponse.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRoleChange(userId: string, roleKey: string) {
    if (!context) return;
    setBusy(userId);

    await fetch(`/api/saas/organizations/${context.organizationId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_key: roleKey }),
    });

    await load();
    setBusy(null);
  }

  async function handleRemove(userId: string) {
    if (!context) return;
    if (!window.confirm("Remove this member from the organization?")) return;

    setBusy(userId);
    await fetch(`/api/saas/organizations/${context.organizationId}/members/${userId}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  async function handleTransfer() {
    if (!context || !transferUserId.trim()) return;
    if (!window.confirm("Transfer ownership? You will become an Admin.")) return;

    setBusy("transfer");
    await fetch(`/api/saas/organizations/${context.organizationId}/transfer-ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newOwnerId: transferUserId.trim() }),
    });
    await load();
    setBusy(null);
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!context) return null;

  const filtered = roster.filter(
    (entry) => !search.trim() || (entry.email ?? "").toLowerCase().includes(search.toLowerCase()) || entry.role_key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by email or role..."
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Workspaces</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((entry) => (
              <tr key={entry.user_id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-900">{entry.email ?? entry.user_id}</td>
                <td className="px-4 py-3">
                  <select
                    value={entry.role_key}
                    onChange={(event) => handleRoleChange(entry.user_id, event.target.value)}
                    disabled={busy === entry.user_id || entry.role_key === "Owner"}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  >
                    {MEMBER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-slate-600">{entry.status}</td>
                <td className="px-4 py-3 text-slate-600">{entry.workspaces.map((w) => w.name).join(", ") || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{new Date(entry.joined_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  {entry.role_key !== "Owner" && (
                    <button onClick={() => handleRemove(entry.user_id)} className="text-xs font-semibold text-red-600 hover:underline">
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {context.role === "Owner" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-sm font-bold text-slate-700">Transfer Ownership</h3>
          <div className="flex flex-wrap gap-2">
            <input
              value={transferUserId}
              onChange={(event) => setTransferUserId(event.target.value)}
              placeholder="New owner's user ID"
              className="min-w-[240px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={handleTransfer}
              disabled={busy === "transfer" || !transferUserId.trim()}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Transfer
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">Find a member&apos;s user ID from your Supabase Auth dashboard.</p>
        </div>
      )}
    </div>
  );
}

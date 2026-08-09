"use client";

import { useCallback, useEffect, useState } from "react";

import { MEMBER_ROLES } from "@/lib/saas/organization-schema";
import type { Organization, OrganizationInvitation, TenantContext } from "@/lib/saas/organization-types";

export default function OrganizationSettingsPage() {
  const [context, setContext] = useState<TenantContext | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("Viewer");
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const meResponse = await fetch("/api/saas/me");
      const me = await meResponse.json();
      setContext(me.context);

      if (!me.context) return;

      const [orgResponse, invitationsResponse] = await Promise.all([
        fetch(`/api/saas/organizations/${me.context.organizationId}`),
        fetch(`/api/saas/organizations/${me.context.organizationId}/invitations`),
      ]);

      const org = await orgResponse.json();
      setOrganization(org);
      setName(org.name);
      setInvitations(await invitationsResponse.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRename() {
    if (!context || !name.trim()) return;
    setBusy("rename");
    setError(null);

    try {
      const response = await fetch(`/api/saas/organizations/${context.organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOrganization(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleInvite() {
    if (!context || !inviteEmail.trim()) return;
    setBusy("invite");
    setError(null);
    setInviteResult(null);

    try {
      const response = await fetch(`/api/saas/organizations/${context.organizationId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role_key: inviteRole }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setInviteResult(`${window.location.origin}${data.acceptUrl}`);
      setInviteEmail("");
      const invitationsResponse = await fetch(`/api/saas/organizations/${context.organizationId}/invitations`);
      setInvitations(await invitationsResponse.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(invitationId: string) {
    if (!context) return;
    await fetch(`/api/saas/organizations/${context.organizationId}/invitations/${invitationId}/revoke`, { method: "POST" });
    const invitationsResponse = await fetch(`/api/saas/organizations/${context.organizationId}/invitations`);
    setInvitations(await invitationsResponse.json());
  }

  async function handleSuspend() {
    if (!context) return;
    setBusy("suspend");
    await fetch(`/api/saas/organizations/${context.organizationId}/suspend`, { method: "POST" });
    window.location.reload();
  }

  async function handleDelete() {
    if (!context) return;
    if (!window.confirm("Delete this organization? This cannot be undone.")) return;
    setBusy("delete");
    await fetch(`/api/saas/organizations/${context.organizationId}`, { method: "DELETE" });
    window.location.href = "/settings/organization";
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!context || !organization) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">Organization Details</h2>
        <p className="mb-3 text-xs text-slate-500">
          Slug: {organization.slug} · Status: {organization.status} · Your role: {context.role}
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-[240px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={handleRename}
            disabled={busy === "rename"}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Save Name
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">Invite Members</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="email@example.com"
            className="min-w-[220px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            {MEMBER_ROLES.filter((role) => role !== "Owner").map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            onClick={handleInvite}
            disabled={busy === "invite" || !inviteEmail.trim()}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Invite
          </button>
        </div>

        {inviteResult && (
          <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800">
            No email provider is configured yet — share this link directly: <span className="font-mono">{inviteResult}</span>
          </div>
        )}

        {invitations.length > 0 && (
          <div className="mt-4 space-y-2">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <span>
                  {invitation.email} — {invitation.role_key} ({invitation.status})
                </span>
                {invitation.status === "pending" && (
                  <button onClick={() => handleRevoke(invitation.id)} className="text-xs font-semibold text-red-600 hover:underline">
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {context.role === "Owner" && (
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-red-700">Danger Zone</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSuspend}
              disabled={busy === "suspend"}
              className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"
            >
              Suspend Organization
            </button>
            <button
              onClick={handleDelete}
              disabled={busy === "delete"}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Delete Organization
            </button>
          </div>
        </div>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    </div>
  );
}

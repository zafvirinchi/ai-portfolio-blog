"use client";

import { useCallback, useEffect, useState } from "react";

import type { TenantContext, Workspace } from "@/lib/saas/organization-types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function WorkspacesSettingsPage() {
  const [context, setContext] = useState<TenantContext | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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

      const workspacesResponse = await fetch(`/api/saas/organizations/${me.context.organizationId}/workspaces`);
      setWorkspaces(await workspacesResponse.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!context || !name.trim()) return;
    setBusy("create");
    setError(null);

    try {
      const response = await fetch(`/api/saas/organizations/${context.organizationId}/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slugify(name), description: description.trim() || null }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setName("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creating the workspace failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleArchive(workspace: Workspace) {
    if (!context) return;
    setBusy(workspace.id);

    await fetch(`/api/saas/organizations/${context.organizationId}/workspaces/${workspace.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reactivate: workspace.status === "archived" }),
    });

    await load();
    setBusy(null);
  }

  async function handleDelete(workspaceId: string) {
    if (!context) return;
    if (!window.confirm("Delete this workspace? This cannot be undone.")) return;

    setBusy(workspaceId);
    await fetch(`/api/saas/organizations/${context.organizationId}/workspaces/${workspaceId}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!context) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-700">Create Workspace</h2>
        <p className="mb-3 text-xs text-slate-500">e.g. Engineering Hiring, Campus Hiring, AI Recruitment, Internal Mobility</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Workspace name"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (optional)"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={busy === "create" || !name.trim()}
          className="mt-3 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Create Workspace
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      {workspaces.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No workspaces yet.</p>
      ) : (
        <div className="space-y-3">
          {workspaces.map((workspace) => (
            <div key={workspace.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="font-semibold text-slate-900">
                  {workspace.name} <span className="text-xs font-normal text-slate-400">({workspace.status})</span>
                </p>
                {workspace.description && <p className="text-sm text-slate-500">{workspace.description}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleArchive(workspace)}
                  disabled={busy === workspace.id}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {workspace.status === "archived" ? "Reactivate" : "Archive"}
                </button>
                <button
                  onClick={() => handleDelete(workspace.id)}
                  disabled={busy === workspace.id}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

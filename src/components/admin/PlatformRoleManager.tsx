"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PLATFORM_ROLES, PlatformRole } from "@/lib/billing/platform-schema";

type Props = {
  userId: string;
  currentRoles: PlatformRole[];
  /** The ADMIN currently viewing this page — lets the UI proactively surface the self-removal confirmation instead of the user discovering it only after a rejected request. */
  viewerUserId: string;
};

const ROLE_LABEL: Record<PlatformRole, string> = { JOB_SEEKER: "Job Seeker", RECRUITER: "Recruiter", ADMIN: "Admin" };

export default function PlatformRoleManager({ userId, currentRoles, viewerUserId }: Props) {
  const router = useRouter();
  const [pendingRole, setPendingRole] = useState<PlatformRole | null>(null);
  const [confirmSelfRemoval, setConfirmSelfRemoval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedToAssign, setSelectedToAssign] = useState<PlatformRole | "">("");

  const availableToAssign = PLATFORM_ROLES.filter((role) => !currentRoles.includes(role));
  const isSelfAdminRemoval = (role: PlatformRole) => role === "ADMIN" && userId === viewerUserId;

  async function mutateRole(role: PlatformRole, action: "assign" | "remove") {
    setPendingRole(role);
    setError(null);

    try {
      const response = await fetch(`/api/admin/platform/users/${userId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, action, confirmSelfRemoval: action === "remove" && isSelfAdminRemoval(role) ? confirmSelfRemoval : undefined }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Role change failed");

      setConfirmSelfRemoval(false);
      setSelectedToAssign("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role change failed.");
    } finally {
      setPendingRole(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {currentRoles.map((role) => (
          <div key={role} className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5">
            <span className="text-sm font-semibold text-blue-700">{ROLE_LABEL[role]}</span>
            <button
              type="button"
              onClick={() => mutateRole(role, "remove")}
              disabled={pendingRole === role || (isSelfAdminRemoval(role) && !confirmSelfRemoval)}
              aria-label={`Remove ${ROLE_LABEL[role]} role`}
              className="text-xs font-bold text-red-600 hover:text-red-800 disabled:opacity-40"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {currentRoles.includes("ADMIN") && userId === viewerUserId && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={confirmSelfRemoval} onChange={(e) => setConfirmSelfRemoval(e.target.checked)} />
          I understand removing my own ADMIN role may reduce my own access.
        </label>
      )}

      {availableToAssign.length > 0 && (
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="assign-role" className="mb-1 block text-xs font-semibold text-slate-500">
              Assign a role
            </label>
            <select
              id="assign-role"
              value={selectedToAssign}
              onChange={(e) => setSelectedToAssign(e.target.value as PlatformRole | "")}
              aria-label="Select a role to assign"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Choose...</option>
              {availableToAssign.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => selectedToAssign && mutateRole(selectedToAssign, "assign")}
            disabled={!selectedToAssign || pendingRole !== null}
            aria-label="Assign selected role"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Assign
          </button>
        </div>
      )}
    </div>
  );
}

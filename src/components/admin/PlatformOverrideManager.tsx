"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FEATURE_IDS } from "@/lib/billing/platform-schema";
import type { EntitlementOverride } from "@/lib/billing/entitlement-overrides-service";

type Props = {
  userId: string;
  overrides: EntitlementOverride[];
};

function isActive(override: EntitlementOverride): boolean {
  if (override.revoked_at) return false;
  if (override.expires_at && new Date(override.expires_at).getTime() < Date.now()) return false;
  return true;
}

export default function PlatformOverrideManager({ userId, overrides }: Props) {
  const router = useRouter();
  const [featureId, setFeatureId] = useState<string>(FEATURE_IDS[0]);
  const [access, setAccess] = useState<"GRANTED" | "REVOKED">("GRANTED");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/platform/users/${userId}/overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          featureId,
          access,
          reason: reason.trim() || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save override");

      setReason("");
      setExpiresAt("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save override.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(overrideId: string) {
    setDeactivatingId(overrideId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/platform/overrides/${overrideId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to deactivate override");

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate override.");
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
        <div>
          <label htmlFor="override-feature" className="mb-1 block text-xs font-semibold text-slate-500">
            Feature
          </label>
          <select id="override-feature" value={featureId} onChange={(e) => setFeatureId(e.target.value)} aria-label="Select feature for override" className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            {FEATURE_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="override-access" className="mb-1 block text-xs font-semibold text-slate-500">
            Access
          </label>
          <select
            id="override-access"
            value={access}
            onChange={(e) => setAccess(e.target.value === "REVOKED" ? "REVOKED" : "GRANTED")}
            aria-label="Select override access type"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="GRANTED">Grant (unlimited access)</option>
            <option value="REVOKED">Revoke (block access)</option>
          </select>
        </div>
        <div>
          <label htmlFor="override-reason" className="mb-1 block text-xs font-semibold text-slate-500">
            Reason (optional)
          </label>
          <input id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Override reason" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. beta access" />
        </div>
        <div>
          <label htmlFor="override-expires" className="mb-1 block text-xs font-semibold text-slate-500">
            Expires (optional)
          </label>
          <input id="override-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} aria-label="Override expiration date" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button type="button" onClick={handleSubmit} disabled={submitting} aria-label="Save entitlement override" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {submitting ? "Saving..." : "Save Override"}
        </button>
      </div>

      <div className="rounded-xl border border-slate-100">
        {overrides.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">No overrides for this user yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th scope="col" className="px-4 py-2 font-semibold">Feature</th>
                <th scope="col" className="px-4 py-2 font-semibold">Access</th>
                <th scope="col" className="px-4 py-2 font-semibold">Status</th>
                <th scope="col" className="px-4 py-2 font-semibold">Expires</th>
                <th scope="col" className="px-4 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {overrides.map((override) => {
                const active = isActive(override);
                return (
                  <tr key={override.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2 text-slate-700">{override.feature_id}</td>
                    <td className="px-4 py-2 text-slate-500">{override.access}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{active ? "Active" : "Inactive"}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-500">{override.expires_at ? new Date(override.expires_at).toLocaleDateString() : "Never"}</td>
                    <td className="px-4 py-2 text-right">
                      {active && (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(override.id)}
                          disabled={deactivatingId === override.id}
                          aria-label={`Deactivate override for ${override.feature_id}`}
                          className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

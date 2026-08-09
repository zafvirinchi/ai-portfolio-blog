"use client";

import { useEffect, useState } from "react";

import { ACTIVITY_TYPES } from "@/lib/saas/organization-schema";
import type { ActivityLogEntry } from "@/lib/saas/organization-types";

export default function ActivitySettingsPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const url = typeFilter ? `/api/saas/activity?activityType=${encodeURIComponent(typeFilter)}` : "/api/saas/activity";
        const response = await fetch(url);
        setEntries(await response.json());
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [typeFilter]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">All activity types</option>
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No activity recorded yet — this fills in once your team uses the AI features (resume upload, job creation,
          etc.) while logged in with this organization active.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{entry.activity_type}</span>
                <span className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-slate-700">{entry.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

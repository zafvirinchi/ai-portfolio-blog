"use client";

import { useState } from "react";

import type { LinkedinRecord } from "@/lib/ai/linkedin/linkedin-types";

type Props = {
  linkedinId: string;
  record: LinkedinRecord;
  onUpdated: (record: LinkedinRecord) => void;
};

export default function LinkedinSkillsTab({ linkedinId, record, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/linkedin/${linkedinId}/skills`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Skills categorization failed");
      }

      onUpdated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skills categorization failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Categorizing skills..." : "Generate Skills"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {(!record.skills || record.skills.length === 0) && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Generate a categorized skills list to see it here.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {record.skills
          ?.filter((group) => group.skills.length > 0)
          .map((group) => (
            <div key={group.category} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">{group.category}</h4>
              <div className="flex flex-wrap gap-1.5">
                {group.skills.map((skill) => (
                  <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

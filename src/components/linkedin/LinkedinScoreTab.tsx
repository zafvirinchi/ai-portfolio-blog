"use client";

import { useState } from "react";

import { PROFILE_SCORE_KEYS } from "@/lib/ai/linkedin/linkedin-schema";
import type { ProfileScoreKey } from "@/lib/ai/linkedin/linkedin-schema";
import type { LinkedinRecord } from "@/lib/ai/linkedin/linkedin-types";

const SCORE_LABELS: Record<ProfileScoreKey, string> = {
  overall: "Overall",
  headline: "Headline",
  about: "About",
  experience: "Experience",
  skills: "Skills",
  projects: "Projects",
  keyword: "Keyword",
  recruiter: "Recruiter",
  seo: "SEO",
  networking: "Networking",
  visibility: "Visibility",
};

type Props = {
  linkedinId: string;
  record: LinkedinRecord;
  onUpdated: (record: LinkedinRecord) => void;
};

export default function LinkedinScoreTab({ linkedinId, record, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCompute() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/linkedin/${linkedinId}/score`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Score computation failed");
      }

      onUpdated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Score computation failed.");
    } finally {
      setLoading(false);
    }
  }

  const score = record.profileScore;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          onClick={handleCompute}
          disabled={loading}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Computing..." : "Compute Profile Score"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!score && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Compute your profile score to see per-section breakdowns and recommendations.
        </p>
      )}

      {score && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center shadow-sm">
            <p className="text-xs font-bold uppercase text-blue-700">Overall Score</p>
            <p className="text-4xl font-extrabold text-blue-900">{Math.round(score.overall.score)}</p>
            <p className="mt-2 text-sm text-blue-800">{score.overall.recommendation}</p>
          </div>

          {PROFILE_SCORE_KEYS.filter((key) => key !== "overall").map((key) => {
            const entry = score[key];

            return (
              <div key={key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700">{SCORE_LABELS[key]}</span>
                  <span className="font-bold text-slate-800">{Math.round(entry.score)}</span>
                </div>
                <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      entry.score >= 70 ? "bg-green-500" : entry.score >= 40 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, entry.score))}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">{entry.recommendation}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

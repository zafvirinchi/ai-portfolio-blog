"use client";

import { useState } from "react";

import type { LinkedinRecord } from "@/lib/ai/linkedin/linkedin-types";

type Props = {
  linkedinId: string;
  record: LinkedinRecord;
  onUpdated: (record: LinkedinRecord) => void;
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="font-bold text-slate-800">{Math.round(score)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

export default function LinkedinSeoTab({ linkedinId, record, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/linkedin/${linkedinId}/seo`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "SEO analysis failed");
      }

      onUpdated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "SEO analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  const seo = record.seo;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          onClick={handleRun}
          disabled={loading}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Run SEO Analysis"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!seo && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Run the SEO analysis to see keyword coverage and search/recruiter visibility scores.
        </p>
      )}

      {seo && (
        <>
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
            <ScoreBar label="Search Ranking Score" score={seo.searchRankingScore} />
            <ScoreBar label="Recruiter Visibility Score" score={seo.recruiterVisibilityScore} />
          </div>

          {seo.keywordCoverage.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-400">
                    <th className="py-2 pr-3">Keyword</th>
                    <th className="px-2">Headline</th>
                    <th className="px-2">About</th>
                    <th className="px-2">Skills</th>
                    <th className="px-2">Experience</th>
                  </tr>
                </thead>
                <tbody>
                  {seo.keywordCoverage.map((row) => (
                    <tr key={row.keyword} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-800">{row.keyword}</td>
                      <td className="px-2">{row.inHeadline ? "✅" : "—"}</td>
                      <td className="px-2">{row.inAbout ? "✅" : "—"}</td>
                      <td className="px-2">{row.inSkills ? "✅" : "—"}</td>
                      <td className="px-2">{row.inExperience ? "✅" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {seo.missingKeywords.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h4 className="mb-2 text-xs font-bold uppercase text-amber-700">Missing Keywords</h4>
              <div className="flex flex-wrap gap-1.5">
                {seo.missingKeywords.map((keyword) => (
                  <span key={keyword} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {seo.recommendations.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Recommendations</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {seo.recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

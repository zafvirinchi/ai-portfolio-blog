"use client";

import { useState } from "react";

import type { CandidateInsights } from "@/lib/ai/recruiter/candidate-schema";
import type { CandidateSummary } from "@/lib/ai/recruiter/candidate-types";

type Props = {
  candidates: CandidateSummary[];
};

const RATED_DIMENSIONS: { key: keyof CandidateInsights; label: string }[] = [
  { key: "hiringRecommendation", label: "Hiring Recommendation" },
  { key: "leadershipPotential", label: "Leadership Potential" },
  { key: "careerGrowth", label: "Career Growth" },
  { key: "learningAbility", label: "Learning Ability" },
  { key: "cultureFit", label: "Culture Fit" },
  { key: "technicalDepth", label: "Technical Depth" },
];

function ratingColor(rating: string) {
  if (rating === "High") return "bg-green-100 text-green-700";
  if (rating === "Medium") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export default function RecruiterInsightsTab({ candidates }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<CandidateInsights | null>(null);

  async function handleGenerate() {
    if (!selectedId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/recruiter/candidates/${selectedId}/insights`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Insights generation failed");

      setInsights(data.insights);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Insights generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setInsights(null);
          }}
          className="min-w-[220px] rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Select a candidate...</option>
          {candidates.map((candidate) => (
            <option key={candidate.candidateId} value={candidate.candidateId}>
              {candidate.name}
            </option>
          ))}
        </select>

        <button
          onClick={handleGenerate}
          disabled={loading || !selectedId}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate Insights"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {insights && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {RATED_DIMENSIONS.map(({ key, label }) => {
              const dimension = insights[key] as { rating: string; explanation: string };
              return (
                <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ratingColor(dimension.rating)}`}>{dimension.rating}</span>
                  </div>
                  <p className="text-sm text-slate-700">{dimension.explanation}</p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
              <h4 className="mb-2 text-xs font-bold uppercase text-green-700">Strengths</h4>
              <ul className="list-disc space-y-1 pl-4 text-sm text-green-800">
                {insights.strengths.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h4 className="mb-2 text-xs font-bold uppercase text-amber-700">Weaknesses</h4>
              <ul className="list-disc space-y-1 pl-4 text-sm text-amber-800">
                {insights.weaknesses.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <h4 className="mb-2 text-xs font-bold uppercase text-red-700">Risk Factors</h4>
              <ul className="list-disc space-y-1 pl-4 text-sm text-red-800">
                {insights.riskFactors.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

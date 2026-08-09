"use client";

import { useCallback, useEffect, useState } from "react";

import type { PipelineCandidate, PipelineInsights } from "@/lib/ai/recruitment/pipeline-types";
import type { CandidateSummary } from "@/lib/ai/recruiter/candidate-types";

type EnrichedPipelineCandidate = PipelineCandidate & { candidate: CandidateSummary | null };

type Props = {
  jobId: string | null;
};

export default function RecruitmentInsightsTab({ jobId }: Props) {
  const [insights, setInsights] = useState<PipelineInsights | null>(null);
  const [entries, setEntries] = useState<EnrichedPipelineCandidate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recommendation, setRecommendation] = useState<PipelineCandidate["hiringRecommendation"] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const url = jobId ? `/api/ai/recruitment/insights?jobId=${jobId}` : "/api/ai/recruitment/insights";
      const [insightsResponse, pipelineResponse] = await Promise.all([
        fetch(url),
        jobId ? fetch(`/api/ai/recruitment/jobs/${jobId}/pipeline`) : Promise.resolve(null),
      ]);
      setInsights(await insightsResponse.json());
      if (pipelineResponse) setEntries(await pipelineResponse.json());
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleGenerateRecommendation() {
    if (!jobId || !selectedId) return;
    setBusy(true);
    setRecommendation(null);

    try {
      const response = await fetch(`/api/ai/recruitment/jobs/${jobId}/pipeline/${selectedId}/recommendation`, { method: "POST" });
      const data = await response.json();
      setRecommendation(data.hiringRecommendation);
    } finally {
      setBusy(false);
    }
  }

  if (loading || !insights) {
    return <p className="text-sm text-slate-500">Loading insights...</p>;
  }

  return (
    <div className="space-y-4">
      {jobId && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-slate-700">AI Hiring Recommendation</h3>
          <div className="flex flex-wrap items-center gap-3">
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="min-w-[220px] rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select a candidate...</option>
              {entries.map((entry) => (
                <option key={entry.candidateId} value={entry.candidateId}>
                  {entry.candidate?.name ?? "Unknown"}
                </option>
              ))}
            </select>
            <button
              onClick={handleGenerateRecommendation}
              disabled={busy || !selectedId}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Generating..." : "Generate Recommendation"}
            </button>
          </div>

          {recommendation && (
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{recommendation.classification}</p>
              <p>
                Cultural Fit: {recommendation.culturalFit.rating} — {recommendation.culturalFit.explanation}
              </p>
              <p>
                Technical Skills: {recommendation.technicalSkills.rating} — {recommendation.technicalSkills.explanation}
              </p>
              <p>
                Leadership Potential: {recommendation.leadershipPotential.rating} — {recommendation.leadershipPotential.explanation}
              </p>
              <p>Risk Factors: {recommendation.riskFactors.join("; ") || "none"}</p>
              <p>Expected Learning Curve: {recommendation.expectedLearningCurve}</p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Top Candidates</h4>
          {insights.topCandidates.length === 0 ? (
            <p className="text-sm text-slate-400">None yet.</p>
          ) : (
            <ol className="space-y-1 text-sm text-slate-700">
              {insights.topCandidates.map((c) => (
                <li key={c.pipelineCandidateId}>
                  {c.candidateName} — {c.rankingScore}/100
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Stuck Candidates</h4>
          {insights.stuckCandidates.length === 0 ? (
            <p className="text-sm text-slate-400">None currently stuck.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-700">
              {insights.stuckCandidates.map((c) => (
                <li key={c.pipelineCandidateId}>
                  {c.candidateName} — {c.daysInStage}d in {c.stage}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Bottlenecks</h4>
          {insights.bottlenecks.length === 0 ? (
            <p className="text-sm text-slate-400">No bottlenecks detected.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-700">
              {insights.bottlenecks.map((b) => (
                <li key={b.stage}>{b.note}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Missing Interviews</h4>
          {insights.missingInterviews.length === 0 ? (
            <p className="text-sm text-slate-400">None.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-700">
              {insights.missingInterviews.map((m) => (
                <li key={m.pipelineCandidateId}>
                  {m.candidateName} — in {m.stage}, no interview scheduled
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Skill Gaps</h4>
          {insights.skillGaps.length === 0 ? (
            <p className="text-sm text-slate-400">Select a job to see skill gaps.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {insights.skillGaps.map((s) => (
                <span key={s.skill} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  {s.skill} ({s.missingCount})
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Offer Acceptance Trend</h4>
          <p className="text-sm text-slate-700">
            Sent: {insights.offerAcceptanceTrend.sent} · Accepted: {insights.offerAcceptanceTrend.accepted} · Declined:{" "}
            {insights.offerAcceptanceTrend.declined}
          </p>
          <p className="text-sm text-slate-700">Acceptance Rate: {insights.offerAcceptanceTrend.acceptanceRate ?? "N/A"}%</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Duplicate Profiles</h4>
          {insights.duplicateProfiles.length === 0 ? (
            <p className="text-sm text-slate-400">None found.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-700">
              {insights.duplicateProfiles.map((d, index) => (
                <li key={index}>
                  {d.candidateNames.join(", ")} — {d.reason}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Incomplete Profiles</h4>
          {insights.incompleteProfiles.length === 0 ? (
            <p className="text-sm text-slate-400">None found.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-700">
              {insights.incompleteProfiles.map((p) => (
                <li key={p.candidateId}>
                  {p.candidateName} — missing {p.missingFields.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

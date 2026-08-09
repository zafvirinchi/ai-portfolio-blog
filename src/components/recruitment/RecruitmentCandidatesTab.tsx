"use client";

import { useCallback, useEffect, useState } from "react";

import type { PipelineCandidate } from "@/lib/ai/recruitment/pipeline-types";
import type { CandidateSummary } from "@/lib/ai/recruiter/candidate-types";

type EnrichedPipelineCandidate = PipelineCandidate & { candidate: CandidateSummary | null };

type Props = {
  jobId: string | null;
};

export default function RecruitmentCandidatesTab({ jobId }: Props) {
  const [entries, setEntries] = useState<EnrichedPipelineCandidate[]>([]);
  const [pool, setPool] = useState<CandidateSummary[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);

    try {
      const [pipelineResponse, poolResponse] = await Promise.all([
        fetch(`/api/ai/recruitment/jobs/${jobId}/pipeline`),
        fetch("/api/ai/recruiter/candidates"),
      ]);
      setEntries(await pipelineResponse.json());
      setPool(await poolResponse.json());
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAttach() {
    if (!jobId || !selectedPoolId) return;
    setAttaching(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/recruitment/jobs/${jobId}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: selectedPoolId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Attaching the candidate failed");

      setSelectedPoolId("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attaching the candidate failed.");
    } finally {
      setAttaching(false);
    }
  }

  if (!jobId) {
    return <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Select a job in the Jobs tab first.</p>;
  }

  const attachableCandidates = pool.filter((candidate) => !entries.some((entry) => entry.candidateId === candidate.candidateId));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <select value={selectedPoolId} onChange={(e) => setSelectedPoolId(e.target.value)} className="min-w-[220px] rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">Attach a candidate from the pool...</option>
          {attachableCandidates.map((candidate) => (
            <option key={candidate.candidateId} value={candidate.candidateId}>
              {candidate.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleAttach}
          disabled={attaching || !selectedPoolId}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {attaching ? "Attaching..." : "Attach to Pipeline"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading candidates...</p>
      ) : entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No candidates attached to this job yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Resume Score</th>
                <th className="px-4 py-3">ATS Score</th>
                <th className="px-4 py-3">JD Match</th>
                <th className="px-4 py-3">Interview Readiness</th>
                <th className="px-4 py-3">Current Stage</th>
                <th className="px-4 py-3">Assigned Recruiter</th>
                <th className="px-4 py-3">Hiring Manager</th>
                <th className="px-4 py-3">Offer Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr key={entry.pipelineCandidateId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{entry.candidate?.name ?? "Unknown"}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.candidate?.scores.resumeScore ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.candidate?.scores.atsScore ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.candidate?.scores.jdMatch ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.candidate?.scores.interviewReadiness ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.stage}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.assignedRecruiter ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.hiringManager ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{entry.offerId ? "Offer created" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

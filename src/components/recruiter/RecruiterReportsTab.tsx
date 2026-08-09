"use client";

import { useState } from "react";

import type { CandidateSummary } from "@/lib/ai/recruiter/candidate-types";

type Props = {
  candidates: CandidateSummary[];
};

export default function RecruiterReportsTab({ candidates }: Props) {
  const [selectedId, setSelectedId] = useState("");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Candidate List Export</h3>
        <div className="flex flex-wrap gap-2">
          <a href="/api/ai/recruiter/export?format=csv" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            CSV
          </a>
          <a href="/api/ai/recruiter/export?format=excel" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Excel
          </a>
          <a href="/api/ai/recruiter/export?format=pdf" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            PDF
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Candidate Report (PDF)</h3>
        <div className="flex flex-wrap items-center gap-3">
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="min-w-[220px] rounded-xl border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select a candidate...</option>
            {candidates.map((candidate) => (
              <option key={candidate.candidateId} value={candidate.candidateId}>
                {candidate.name}
              </option>
            ))}
          </select>

          {selectedId ? (
            <a
              href={`/api/ai/recruiter/candidates/${selectedId}/export`}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Download Candidate Report
            </a>
          ) : (
            <button disabled className="rounded-xl bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-400">
              Download Candidate Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

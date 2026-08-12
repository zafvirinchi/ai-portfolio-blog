"use client";

import { useState } from "react";

import type { CandidateSummary } from "@/lib/ai/recruiter/candidate-types";
import type { RecruiterJobRecord } from "@/lib/ai/recruiter/recruiter-job-types";

type Props = {
  candidates: CandidateSummary[];
  jobs: RecruiterJobRecord[];
};

export default function RecruiterReportsTab({ candidates, jobs }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [exportJobId, setExportJobId] = useState("");
  const jobQuery = exportJobId ? `&jobId=${exportJobId}` : "";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Candidate Screening Report</h3>
        <label className="mb-2 block text-xs font-semibold text-slate-500" htmlFor="export-job-select">
          Scope to a job (optional)
        </label>
        <select
          id="export-job-select"
          value={exportJobId}
          onChange={(e) => setExportJobId(e.target.value)}
          className="mb-3 w-full max-w-sm rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All jobs</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/ai/recruiter/export?format=csv${jobQuery}`}
            aria-label="Export candidates as CSV"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            CSV
          </a>
          <a
            href={`/api/ai/recruiter/export?format=excel${jobQuery}`}
            aria-label="Export candidates as XLSX"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Excel
          </a>
          <a
            href={`/api/ai/recruiter/export?format=pdf${jobQuery}`}
            aria-label="Export candidates as PDF"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            PDF
          </a>
        </div>
      </div>

      {/* Phase 16 Milestone 9, §4 — a pure rendering of the existing analytics engine's already-computed output; zero LLM calls, zero new metrics. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-sm font-bold text-slate-700">Hiring Decision Report</h3>
        <p className="mb-3 text-xs text-slate-500">Pipeline summary, conversion metrics, decision breakdown, interview outcome, and top candidates — deterministic, same scope as above.</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/ai/recruiter/export?type=hiring-report&format=csv${jobQuery}`}
            aria-label="Export hiring report as CSV"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export Hiring Report (CSV)
          </a>
          <a
            href={`/api/ai/recruiter/export?type=hiring-report&format=excel${jobQuery}`}
            aria-label="Export hiring report as XLSX"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export Hiring Report (Excel)
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

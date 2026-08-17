"use client";

import { useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo } from "@/lib/billing/entitlement-client-error";
import { downloadExport } from "@/lib/billing/export-download";
import type { CandidateSummary } from "@/lib/ai/recruiter/candidate-types";
import type { RecruiterJobRecord } from "@/lib/ai/recruiter/recruiter-job-types";

type Props = {
  candidates: CandidateSummary[];
  jobs: RecruiterJobRecord[];
};

// Phase 18 Milestone 8, Step 11 — these 5 links (unlike the single-
// candidate PDF report below, which has no entitlement gate at all)
// hit /api/ai/recruiter/export, gated by recruiter.export/
// recruiter.hiring_report since M5. A plain <a href> can't intercept a
// 402 JSON rejection — the browser just navigates the whole tab to raw
// JSON. Converted to fetch+blob (downloadExport(), extracted Phase 19
// M5 into export-download.ts once this same pattern was needed a 2nd
// and 3rd time elsewhere) so a rejection renders UpgradePrompt inline
// instead, without changing the SUCCESS path's actual file-saving
// behavior at all (still a real browser download, same filename, same
// content-type). Deliberately NOT applied to the "Download Candidate
// Report" link below — that route has no entitlement gate to intercept
// in the first place (verified this milestone), so converting it would
// add complexity with nothing to fix.
export default function RecruiterReportsTab({ candidates, jobs }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [exportJobId, setExportJobId] = useState("");
  const jobQuery = exportJobId ? `&jobId=${exportJobId}` : "";

  const [pendingExport, setPendingExport] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport(key: string, url: string, filename: string) {
    setPendingExport(key);
    setEntitlementError(null);
    setExportError(null);

    const result = await downloadExport(url, filename);

    if (result && "networkError" in result) {
      setExportError(result.networkError);
    } else if (result) {
      setEntitlementError(result);
    }

    setPendingExport(null);
  }

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
          <button
            type="button"
            onClick={() => handleExport("candidates-csv", `/api/ai/recruiter/export?format=csv${jobQuery}`, "candidates.csv")}
            disabled={pendingExport === "candidates-csv"}
            aria-label="Export candidates as CSV"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingExport === "candidates-csv" ? "Exporting..." : "CSV"}
          </button>
          <button
            type="button"
            onClick={() => handleExport("candidates-excel", `/api/ai/recruiter/export?format=excel${jobQuery}`, "candidates.xlsx")}
            disabled={pendingExport === "candidates-excel"}
            aria-label="Export candidates as XLSX"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingExport === "candidates-excel" ? "Exporting..." : "Excel"}
          </button>
          <button
            type="button"
            onClick={() => handleExport("candidates-pdf", `/api/ai/recruiter/export?format=pdf${jobQuery}`, "candidates.pdf")}
            disabled={pendingExport === "candidates-pdf"}
            aria-label="Export candidates as PDF"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingExport === "candidates-pdf" ? "Exporting..." : "PDF"}
          </button>
        </div>
      </div>

      {/* Phase 16 Milestone 9, §4 — a pure rendering of the existing analytics engine's already-computed output; zero LLM calls, zero new metrics. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-sm font-bold text-slate-700">Hiring Decision Report</h3>
        <p className="mb-3 text-xs text-slate-500">Pipeline summary, conversion metrics, decision breakdown, interview outcome, and top candidates — deterministic, same scope as above.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleExport("hiring-report-csv", `/api/ai/recruiter/export?type=hiring-report&format=csv${jobQuery}`, "hiring-report.csv")}
            disabled={pendingExport === "hiring-report-csv"}
            aria-label="Export hiring report as CSV"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingExport === "hiring-report-csv" ? "Exporting..." : "Export Hiring Report (CSV)"}
          </button>
          <button
            type="button"
            onClick={() => handleExport("hiring-report-excel", `/api/ai/recruiter/export?type=hiring-report&format=excel${jobQuery}`, "hiring-report.xlsx")}
            disabled={pendingExport === "hiring-report-excel"}
            aria-label="Export hiring report as XLSX"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingExport === "hiring-report-excel" ? "Exporting..." : "Export Hiring Report (Excel)"}
          </button>
        </div>
      </div>

      {entitlementError && (
        <UpgradePrompt
          featureLabel="Candidate Export"
          code={entitlementError.code}
          featureId={entitlementError.featureId}
          message={entitlementError.message}
          limit={entitlementError.limit}
          used={entitlementError.used}
          period={entitlementError.period}
        />
      )}
      {exportError && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {exportError}
        </div>
      )}

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

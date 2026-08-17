"use client";

import { useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import { downloadExport } from "@/lib/billing/export-download";
import type { CandidateSummary } from "@/lib/ai/recruiter/candidate-types";
import type { ComparisonResult } from "@/lib/ai/recruiter/candidate-types";
import type { RecruiterJobRecord } from "@/lib/ai/recruiter/recruiter-job-types";

type Props = {
  candidates: CandidateSummary[];
  jobs: RecruiterJobRecord[];
};

// Phase 19 Milestone 5 — genuine defect found and fixed: /api/ai/recruiter/
// export?type=comparison is gated by recruiter.export/RECRUITER_EXPORTS
// (export/route.ts), a DIFFERENT feature from the recruiter.analytics
// gate on /compare that produces the `result` these links export — on
// RECRUITER_PRO, recruiter.analytics is UNLIMITED but recruiter.export
// is capped at 50/month, so a recruiter who exhausted their export quota
// could still generate a comparison, then hit these plain <a href> links
// and have the whole tab navigate to raw 402 JSON — the exact bug class
// Phase 18 Milestone 8 already fixed for RecruiterReportsTab.tsx's 5
// export links (fetch+blob via downloadExport(), UpgradePrompt on
// rejection) but missed here. Mirrors that same, already-established
// pattern exactly — no new export mechanism invented.
export default function RecruiterComparisonTab({ candidates, jobs }: Props) {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [pendingExport, setPendingExport] = useState<string | null>(null);

  function toggle(candidateId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(candidateId)) return prev.filter((id) => id !== candidateId);
      if (prev.length >= 5) return prev;
      return [...prev, candidateId];
    });
  }

  async function handleCompare() {
    if (selectedIds.length < 2) return;

    setLoading(true);
    setError(null);
    setEntitlementError(null);

    try {
      const response = await fetch("/api/ai/recruiter/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: selectedIds }),
      });

      const data = await response.json();

      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Comparison failed");
        if (entitlement) {
          setEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Comparison failed");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(key: string, url: string, filename: string) {
    setPendingExport(key);
    setEntitlementError(null);

    const exportResult = await downloadExport(url, filename);

    if (exportResult && "networkError" in exportResult) {
      setError(exportResult.networkError);
    } else if (exportResult) {
      setEntitlementError(exportResult);
    }

    setPendingExport(null);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-700">Select 2-5 candidates to compare</p>

        {candidates.length === 0 ? (
          <p className="text-sm text-slate-400">Import candidates first.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((candidate) => (
              <label
                key={candidate.candidateId}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  selectedIds.includes(candidate.candidateId) ? "border-blue-400 bg-blue-50" : "border-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(candidate.candidateId)}
                  onChange={() => toggle(candidate.candidateId)}
                  aria-label={`Select ${candidate.name} for comparison`}
                />
                <span className="flex-1">
                  <span className="block font-medium text-slate-800">{candidate.name}</span>
                  <span className="block text-xs text-slate-400">{candidate.jobId ? jobById.get(candidate.jobId)?.title ?? "Unknown job" : "Unattached"}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <button
          onClick={handleCompare}
          disabled={loading || selectedIds.length < 2}
          className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Comparing..." : "Generate Comparison"}
        </button>
      </div>

      {entitlementError && (
        <UpgradePrompt
          featureLabel="Candidate Comparison"
          code={entitlementError.code}
          featureId={entitlementError.featureId}
          message={entitlementError.message}
          limit={entitlementError.limit}
          used={entitlementError.used}
          period={entitlementError.period}
          onRetry={handleCompare}
        />
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Phase 16 Milestone 9, §7 — renders the same table already on screen; never re-invokes /compare's LLM call. */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                handleExport("comparison-csv", `/api/ai/recruiter/export?type=comparison&format=csv&candidateIds=${result.candidateIds.join(",")}`, "comparison.csv")
              }
              disabled={pendingExport === "comparison-csv"}
              aria-label="Export comparison as CSV"
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingExport === "comparison-csv" ? "Exporting..." : "Export Comparison (CSV)"}
            </button>
            <button
              type="button"
              onClick={() =>
                handleExport("comparison-excel", `/api/ai/recruiter/export?type=comparison&format=excel&candidateIds=${result.candidateIds.join(",")}`, "comparison.xlsx")
              }
              disabled={pendingExport === "comparison-excel"}
              aria-label="Export comparison as XLSX"
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingExport === "comparison-excel" ? "Exporting..." : "Export Comparison (Excel)"}
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-400">
                  <th className="py-2 pr-3">Metric</th>
                  {result.candidates.map((candidate) => (
                    <th key={candidate.candidateId} className="px-2 py-2">
                      {candidate.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.table.map((row) => (
                  <tr key={row.metric} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-800">{row.metric}</td>
                    {result.candidates.map((candidate) => (
                      <td key={candidate.candidateId} className="px-2 py-2 text-slate-600">
                        {row.values[candidate.candidateId] ?? "N/A"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Recommendation</h4>
            <p className="text-sm text-slate-700">{result.recommendation}</p>
            <p className="mt-2 text-xs text-slate-500">{result.rankingRationale}</p>
          </div>

          {result.perCandidateNotes.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {result.perCandidateNotes.map((note) => {
                const candidate = result.candidates.find((c) => c.candidateId === note.candidateId);
                return (
                  <div key={note.candidateId} className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
                    <p className="font-semibold text-slate-800">{candidate?.name ?? note.candidateId}</p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
                      {note.keyDifferentiators.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

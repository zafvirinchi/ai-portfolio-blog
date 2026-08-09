"use client";

import { useState } from "react";

import type { DashboardSummary } from "@/lib/ai/recruiter/candidate-types";

type Props = {
  dashboard: DashboardSummary | null;
  loadingDashboard: boolean;
  onRefreshDashboard: () => void;
  onImported: () => void;
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function RecruiterDashboardTab({ dashboard, loadingDashboard, onRefreshDashboard, onImported }: Props) {
  const [jdText, setJdText] = useState("");
  const [jdLoading, setJdLoading] = useState(false);
  const [jdResult, setJdResult] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSetJobDescription() {
    if (!jdText.trim()) return;
    setJdLoading(true);
    setError(null);
    setJdResult(null);

    try {
      const response = await fetch("/api/ai/recruiter/job-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: jdText.trim() }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Setting the job description failed");

      setJdResult(`Matched ${data.matched} candidate(s)${data.failed > 0 ? `, ${data.failed} failed` : ""}.`);
      onRefreshDashboard();
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setting the job description failed.");
    } finally {
      setJdLoading(false);
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setImportLoading(true);
    setError(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      Array.from(files)
        .slice(0, 10)
        .forEach((file) => formData.append("files", file));

      const response = await fetch("/api/ai/recruiter/candidates/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed");

      setImportResult(
        `Imported ${data.imported.length} candidate(s)${data.failed.length > 0 ? `, ${data.failed.length} failed (${data.failed.map((f: { filename: string }) => f.filename).join(", ")})` : ""}.`
      );
      onRefreshDashboard();
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImportLoading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Import Resumes</h3>
        <p className="mb-3 text-xs text-slate-500">
          Upload up to 10 resumes at a time (each is parsed and analyzed individually — larger batches may take a while).
        </p>
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt"
          onChange={handleImport}
          disabled={importLoading}
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700"
        />
        {importLoading && <p className="mt-2 text-sm text-slate-500">Importing...</p>}
        {importResult && <p className="mt-2 text-sm text-green-700">{importResult}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-sm font-bold text-slate-700">Workspace Job Description</h3>
        <p className="mb-3 text-xs text-slate-500">
          Paste one job description to screen every candidate against — sets the ATS/JD Match columns workspace-wide.
        </p>
        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          rows={5}
          placeholder="Paste the job description here..."
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          onClick={handleSetJobDescription}
          disabled={jdLoading || !jdText.trim()}
          className="mt-3 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {jdLoading ? "Matching candidates..." : "Set Job Description & Match Candidates"}
        </button>
        {jdResult && <p className="mt-2 text-sm text-green-700">{jdResult}</p>}
        {dashboard?.activeJobDescriptionSet && <p className="mt-2 text-xs text-blue-600">A job description is currently active for this workspace.</p>}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loadingDashboard && <p className="text-sm text-slate-500">Loading dashboard...</p>}

      {dashboard && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Total Candidates" value={dashboard.totalCandidates} />
            <StatCard label="Shortlisted" value={dashboard.shortlisted} />
            <StatCard label="Interview Scheduled" value={dashboard.interviewScheduled} />
            <StatCard label="Rejected" value={dashboard.rejected} />
            <StatCard label="Pending Review" value={dashboard.pendingReview} />
            <StatCard label="Average ATS Score" value={dashboard.averageAtsScore ?? "N/A"} />
            <StatCard label="Average JD Match" value={dashboard.averageJdMatch ?? "N/A"} />
            <StatCard label="Average Experience" value={dashboard.averageExperience !== null ? `${dashboard.averageExperience} yrs` : "N/A"} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Skill Distribution</h4>
              {dashboard.skillDistribution.length === 0 ? (
                <p className="text-sm text-slate-400">No candidates imported yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {dashboard.skillDistribution.map((item) => (
                    <span key={item.skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                      {item.skill} ({item.count})
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Top Technologies</h4>
              {dashboard.topTechnologies.length === 0 ? (
                <p className="text-sm text-slate-400">No candidates imported yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {dashboard.topTechnologies.map((item) => (
                    <span key={item.technology} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {item.technology} ({item.count})
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Recent Uploads</h4>
            {dashboard.recentUploads.length === 0 ? (
              <p className="text-sm text-slate-400">No candidates imported yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {dashboard.recentUploads.map((candidate) => (
                  <li key={candidate.candidateId} className="py-2">
                    <span className="font-semibold text-slate-800">{candidate.name}</span> — {candidate.currentRole ?? "role unknown"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

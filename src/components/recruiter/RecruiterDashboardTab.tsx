"use client";

import { useCallback, useEffect, useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import type { CandidateSummary, DashboardSummary } from "@/lib/ai/recruiter/candidate-types";
import type { RecruiterJobRecord } from "@/lib/ai/recruiter/recruiter-job-types";

type Props = {
  dashboard: DashboardSummary | null;
  loadingDashboard: boolean;
  candidates: CandidateSummary[];
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

export default function RecruiterDashboardTab({ dashboard, loadingDashboard, candidates, onRefreshDashboard, onImported }: Props) {
  const [jobs, setJobs] = useState<RecruiterJobRecord[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [jobText, setJobText] = useState("");
  const [jobCreating, setJobCreating] = useState(false);
  const [importJobId, setImportJobId] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importEntitlementError, setImportEntitlementError] = useState<EntitlementErrorInfo | null>(null);

  const refreshJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const response = await fetch("/api/ai/recruiter/jobs");
      const data = await response.json();
      if (response.ok) setJobs(data);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  async function handleCreateJob() {
    if (!jobTitle.trim() || !jobText.trim()) return;
    setJobCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/recruiter/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: jobTitle.trim(), company: jobCompany.trim() || undefined, jobDescriptionText: jobText.trim() }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Creating the job failed");

      setJobTitle("");
      setJobCompany("");
      setJobText("");
      await refreshJobs();
      onRefreshDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creating the job failed.");
    } finally {
      setJobCreating(false);
    }
  }

  async function handleDeleteJob(jobId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/ai/recruiter/jobs/${jobId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Deleting the job failed");
      }
      if (importJobId === jobId) setImportJobId("");
      await refreshJobs();
      onRefreshDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deleting the job failed.");
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setImportLoading(true);
    setError(null);
    setImportEntitlementError(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      Array.from(files)
        .slice(0, 10)
        .forEach((file) => formData.append("files", file));
      if (importJobId) formData.append("jobId", importJobId);

      const response = await fetch("/api/ai/recruiter/candidates/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Import failed");
        if (entitlement) {
          setImportEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Import failed");
      }

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
        <h3 className="mb-1 text-sm font-bold text-slate-700">Your Jobs</h3>
        <p className="mb-3 text-xs text-slate-500">Each job you create is yours alone — other recruiters never see it or its candidates.</p>

        <div className="mb-4 space-y-2">
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Job title" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={jobCompany} onChange={(e) => setJobCompany(e.target.value)} placeholder="Company (optional)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <textarea
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            rows={4}
            placeholder="Paste the job description here..."
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button
            onClick={handleCreateJob}
            disabled={jobCreating || !jobTitle.trim() || !jobText.trim()}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {jobCreating ? "Creating..." : "Create Job"}
          </button>
        </div>

        {loadingJobs ? (
          <p className="text-sm text-slate-500">Loading jobs...</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-slate-400">No jobs yet — create one above, then attach candidates to it below.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {jobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-semibold text-slate-800">{job.title}</span>
                  {job.company ? ` — ${job.company}` : ""}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{job.status}</span>
                </span>
                <button onClick={() => handleDeleteJob(job.id)} className="text-xs font-semibold text-red-600 hover:underline">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Job Workspace</h3>
        <label className="mb-2 block text-xs font-semibold text-slate-500" htmlFor="workspace-job-select">
          Select Job
        </label>
        <select
          id="workspace-job-select"
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Choose a job to view its candidates...</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>

        {selectedJobId &&
          (() => {
            const job = jobs.find((j) => j.id === selectedJobId);
            const jobCandidates = candidates.filter((c) => c.jobId === selectedJobId);
            const matched = jobCandidates.filter((c) => c.scores.jdMatch !== null);
            const matchAverage = matched.length > 0 ? Math.round(matched.reduce((sum, c) => sum + (c.scores.jdMatch ?? 0), 0) / matched.length) : null;

            return (
              <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
                <div>
                  <p className="text-xs uppercase text-slate-400">Company</p>
                  <p className="font-semibold text-slate-800">{job?.company ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-400">Candidates</p>
                  <p className="font-semibold text-slate-800">{jobCandidates.length}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-400">Match Average</p>
                  <p className="font-semibold text-slate-800">{matchAverage !== null ? `${matchAverage}%` : "Not Evaluated"}</p>
                </div>
              </div>
            );
          })()}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Import Resumes</h3>
        <p className="mb-3 text-xs text-slate-500">
          Upload up to 10 resumes at a time (each is parsed and analyzed individually — larger batches may take a while). Optionally attach them to one of your jobs to match ATS/JD scores immediately.
        </p>

        <label className="mb-2 block text-xs font-semibold text-slate-500" htmlFor="import-job-select">
          Attach to job (optional)
        </label>
        <select
          id="import-job-select"
          value={importJobId}
          onChange={(e) => setImportJobId(e.target.value)}
          className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">No job — import unattached</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>

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
        {importEntitlementError && (
          <UpgradePrompt
            className="mt-3"
            featureLabel="Candidate Import"
            code={importEntitlementError.code}
          featureId={importEntitlementError.featureId}
            message={importEntitlementError.message}
            limit={importEntitlementError.limit}
            used={importEntitlementError.used}
            period={importEntitlementError.period}
          />
        )}
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
            <StatCard label="Jobs" value={dashboard.jobCount} />
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

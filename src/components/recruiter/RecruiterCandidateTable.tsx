"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementAwareError, EntitlementErrorInfo } from "@/lib/billing/entitlement-client-error";
import { downloadExport } from "@/lib/billing/export-download";
import { ALLOWED_STATUS_TRANSITIONS, CANDIDATE_STATUSES, CandidateStatus } from "@/lib/ai/recruiter/candidate-schema";
import { buildInterviewEligibility, isInterviewEligibleStatus } from "@/lib/ai/recruiter/candidate-interview";
import type { CandidateFitLevel, CandidateSummary, EvaluationStatus } from "@/lib/ai/recruiter/candidate-types";
import type { RecruiterJobRecord } from "@/lib/ai/recruiter/recruiter-job-types";

type SortKey = "fit" | "ats" | "jdMatch" | "experience" | "evaluated" | "latest" | "name" | "shortlistedFirst" | "interviewReadiness";

const FIT_LEVELS: CandidateFitLevel[] = ["STRONG", "GOOD", "MODERATE", "LOW"];
const EVALUATION_FILTERS: { value: EvaluationStatus | ""; label: string }[] = [
  { value: "", label: "All evaluation states" },
  { value: "complete", label: "Evaluated" },
  { value: "stale", label: "Stale" },
  { value: "not_evaluated", label: "Not Evaluated" },
];

// Phase 16 Milestone 1, §8 — same fit-level palette used elsewhere in the recruiter workspace.
const FIT_LEVEL_CLASSNAME: Record<CandidateFitLevel, string> = {
  STRONG: "bg-green-100 text-green-700",
  GOOD: "bg-blue-100 text-blue-700",
  MODERATE: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

// Phase 16 Milestone 5, §15 — deliberately no "Evaluation Failed" icon
// here: a failed match never touches the persisted candidate row (see
// candidate-service.ts's doc comments), so there is no stored state to
// render one for — only the transient action-error banner on the
// candidate detail page reflects a failed attempt.
const EVALUATION_STATUS_DISPLAY: Record<EvaluationStatus, { icon: string; label: string; className: string }> = {
  complete: { icon: "✓", label: "Evaluated", className: "text-green-700" },
  stale: { icon: "⚠", label: "Stale", className: "text-amber-700" },
  not_evaluated: { icon: "○", label: "Not Evaluated", className: "text-slate-400" },
};

type Props = {
  candidates: CandidateSummary[];
  jobs: RecruiterJobRecord[];
  loading: boolean;
  onStatusChange: (candidateId: string, status: CandidateStatus) => void;
  onBulkStatusChange: (candidateIds: string[], status: CandidateStatus) => Promise<void>;
  /**
   * Phase 16 Milestone 8, §3 — "interview" pre-filters to candidates
   * already in Interview Scheduled, plus Shortlisted/On Hold candidates
   * who are interview-eligible (candidate-interview.ts's
   * buildInterviewEligibility — reused, not recomputed). Reuses this
   * SAME table/sort/filter/bulk-action infrastructure rather than a
   * second recruiter table component — only the baseline candidate set
   * and an extra Eligibility column differ.
   */
  scope?: "all" | "interview";
};

export default function RecruiterCandidateTable({ candidates, jobs, loading, onStatusChange, onBulkStatusChange, scope = "all" }: Props) {
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [fitFilter, setFitFilter] = useState<string>("");
  const [evaluationFilter, setEvaluationFilter] = useState<EvaluationStatus | "">("");
  const [minExperience, setMinExperience] = useState("");
  const [minAts, setMinAts] = useState("");
  const [minJdMatch, setMinJdMatch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("latest");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkEntitlementError, setBulkEntitlementError] = useState<EntitlementErrorInfo | null>(null);
  const [lastBulkStatus, setLastBulkStatus] = useState<CandidateStatus | null>(null);
  const [pendingExport, setPendingExport] = useState<string | null>(null);

  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);

  const filtered = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase();

    let result = candidates.filter((candidate) => {
      // Phase 16 Milestone 8, §3 — the Interview Queue's baseline set:
      // already-scheduled candidates, plus interview-eligible candidates
      // one step away (Shortlisted/On Hold). Applied before the user's
      // own filters below, same as any other base scope.
      if (scope === "interview") {
        const alreadyInterviewing = candidate.status === "Interview Scheduled";
        const eligibleNextStep = isInterviewEligibleStatus(candidate.status) && buildInterviewEligibility(candidate).eligible;
        if (!alreadyInterviewing && !eligibleNextStep) return false;
      }

      if (jobFilter && candidate.jobId !== jobFilter) return false;
      if (statusFilter && candidate.status !== statusFilter) return false;
      if (fitFilter && candidate.fitLevel !== fitFilter) return false;
      if (evaluationFilter && candidate.evaluationStatus !== evaluationFilter) return false;
      if (minExperience && (candidate.experienceYears ?? 0) < Number(minExperience)) return false;
      if (minAts && (candidate.scores.atsScore ?? -1) < Number(minAts)) return false;
      if (minJdMatch && (candidate.scores.jdMatch ?? -1) < Number(minJdMatch)) return false;

      // §5 — search across name/email/company/job title/skills-as-tags, deterministic, no LLM/vector search.
      if (lowerSearch) {
        const haystack = [candidate.name, candidate.currentRole, candidate.currentCompany, candidate.location, ...candidate.tags]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(lowerSearch)) return false;
      }

      return true;
    });

    // §7 — SORTING is a UI ordering choice over already-computed
    // fields; it never recomputes or competes with Milestone 1's own
    // RANKING (computeRankingScore/compareRanked, used by the separate
    // Ranking & Recommendations panel and computeRanking()). "fit"
    // here simply orders by the same fitScore that ranking already
    // exposes on every summary — not a second scoring pass.
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "fit":
          return b.fitScore - a.fitScore;
        case "ats":
          return (b.scores.atsScore ?? -1) - (a.scores.atsScore ?? -1);
        case "jdMatch":
          return (b.scores.jdMatch ?? -1) - (a.scores.jdMatch ?? -1);
        case "experience":
          return (b.experienceYears ?? -1) - (a.experienceYears ?? -1);
        case "evaluated":
          return (b.evaluatedAt ?? "").localeCompare(a.evaluatedAt ?? "");
        // Phase 16 Milestone 8, §8 — the one genuinely missing sort key
        // (Candidate Fit/JD Match/Last Evaluated already existed as
        // "fit"/"jdMatch"/"evaluated"). A missing (null) readiness
        // score sorts last, never treated as 0 — never touches the
        // underlying candidate.scores.interviewReadiness value itself.
        case "interviewReadiness":
          return (b.scores.interviewReadiness ?? -1) - (a.scores.interviewReadiness ?? -1);
        case "name":
          return a.name.localeCompare(b.name);
        // Phase 16 Milestone 7, §8 — a PRESENTATION-only ordering
        // preference: shortlisted candidates first, then the same
        // Candidate Fit ordering within each group. Never touches
        // fitScore/scores.jdMatch/scores.atsScore themselves, and
        // never changes the separate Ranking & Recommendations panel
        // (computeRanking()/rankCandidates(), untouched).
        case "shortlistedFirst": {
          const aShortlisted = a.status === "Shortlisted" ? 0 : 1;
          const bShortlisted = b.status === "Shortlisted" ? 0 : 1;
          return aShortlisted !== bShortlisted ? aShortlisted - bShortlisted : b.fitScore - a.fitScore;
        }
        case "latest":
        default:
          return b.importedAt.localeCompare(a.importedAt);
      }
    });

    return result;
  }, [candidates, scope, search, jobFilter, statusFilter, fitFilter, evaluationFilter, minExperience, minAts, minJdMatch, sortKey]);

  const selectedJob = jobFilter ? jobById.get(jobFilter) : null;
  const jobCandidates = jobFilter ? candidates.filter((c) => c.jobId === jobFilter) : [];
  const jobMatchedCount = jobCandidates.filter((c) => c.scores.jdMatch !== null);
  const jobAverageMatch =
    jobMatchedCount.length > 0 ? Math.round(jobMatchedCount.reduce((sum, c) => sum + (c.scores.jdMatch ?? 0), 0) / jobMatchedCount.length) : null;
  const jobAverageAts =
    jobCandidates.filter((c) => c.scores.atsScore !== null).length > 0
      ? Math.round(
          jobCandidates.filter((c) => c.scores.atsScore !== null).reduce((sum, c) => sum + (c.scores.atsScore ?? 0), 0) /
            jobCandidates.filter((c) => c.scores.atsScore !== null).length
        )
      : null;

  function toggleSelect(candidateId: string) {
    setSelectedIds((prev) => (prev.includes(candidateId) ? prev.filter((id) => id !== candidateId) : [...prev, candidateId]));
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === filtered.length ? [] : filtered.map((c) => c.candidateId)));
  }

  async function handleBulkAction(status: CandidateStatus) {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkEntitlementError(null);
    setLastBulkStatus(status);
    try {
      await onBulkStatusChange(selectedIds, status);
      setSelectedIds([]);
    } catch (err) {
      // Phase 19 M4, Step 5 — a genuine entitlement rejection (e.g. a
      // Free-tier recruiter's bulk write blocked, Phase 19 M3 §6) gets
      // the same UpgradePrompt every other gated surface uses, instead
      // of collapsing to a plain string.
      if (err instanceof EntitlementAwareError) {
        setBulkEntitlementError(err.info);
        return;
      }
      // §4/§24 — the whole batch is rejected server-side (atomic, no
      // partial writes) whenever any selected candidate can't legally
      // reach `status` — surfaced here rather than silently discarded.
      setBulkError(err instanceof Error ? err.message : "Bulk update failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  // Phase 19 Milestone 5 — genuine defect found and fixed: these two
  // links hit /api/ai/recruiter/export, gated by recruiter.export/
  // RECRUITER_EXPORTS (the same route Phase 18 M8 already fixed 5
  // OTHER callers of, in RecruiterReportsTab.tsx) — a plain <a href>
  // can't intercept a 402 JSON rejection, so a recruiter who exhausted
  // their export quota would have the whole tab navigate to raw JSON
  // instead of seeing UpgradePrompt. Converted to the same fetch+blob
  // pattern (downloadExport()) as every other export link in this app.
  async function handleExport(key: string, url: string, filename: string) {
    setPendingExport(key);
    setBulkEntitlementError(null);
    setLastBulkStatus(null); // not a bulk-status rejection — no retry action applies

    const result = await downloadExport(url, filename);

    if (result && "networkError" in result) {
      setBulkError(result.networkError);
    } else if (result) {
      setBulkEntitlementError(result);
    }

    setPendingExport(null);
  }

  return (
    <div className="space-y-4">
      {selectedJob && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-lg font-bold text-slate-900">{selectedJob.title}</p>
          {selectedJob.company && <p className="text-sm text-slate-500">{selectedJob.company}</p>}
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase text-slate-400">Candidates</p>
              <p className="font-semibold text-slate-800">{jobCandidates.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Avg JD Match</p>
              <p className="font-semibold text-slate-800">{jobAverageMatch !== null ? `${jobAverageMatch}%` : "Not Evaluated"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Avg ATS</p>
              <p className="font-semibold text-slate-800">{jobAverageAts ?? "Not Evaluated"}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, skills, company, location..."
          aria-label="Search candidates"
          className="min-w-[220px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} aria-label="Filter by job" className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">All jobs</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {CANDIDATE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select value={fitFilter} onChange={(e) => setFitFilter(e.target.value)} aria-label="Filter by candidate fit level" className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">All fit levels</option>
          {FIT_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>

        <select
          value={evaluationFilter}
          onChange={(e) => setEvaluationFilter(e.target.value as EvaluationStatus | "")}
          aria-label="Filter by evaluation status"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          {EVALUATION_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <input
          type="number"
          value={minExperience}
          onChange={(e) => setMinExperience(e.target.value)}
          placeholder="Min years exp."
          aria-label="Minimum years of experience"
          className="w-32 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <input
          type="number"
          value={minAts}
          onChange={(e) => setMinAts(e.target.value)}
          placeholder="Min ATS score"
          aria-label="Minimum ATS score"
          className="w-32 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <input
          type="number"
          value={minJdMatch}
          onChange={(e) => setMinJdMatch(e.target.value)}
          placeholder="Min JD match %"
          aria-label="Minimum JD match percentage"
          className="w-32 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Sort candidates" className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="latest">Sort: Recently Added</option>
          <option value="fit">Sort: Candidate Fit</option>
          <option value="ats">Sort: ATS Score</option>
          <option value="jdMatch">Sort: JD Match</option>
          <option value="experience">Sort: Experience</option>
          <option value="evaluated">Sort: Recently Evaluated</option>
          <option value="name">Sort: Name</option>
          <option value="shortlistedFirst">Sort: Shortlisted First</option>
          <option value="interviewReadiness">Sort: Interview Readiness</option>
        </select>
      </div>

      {scope === "interview" && (
        <p className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
          Showing candidates already scheduled for interview, plus Shortlisted/On Hold candidates who are interview-eligible.
        </p>
      )}

      {selectedIds.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm">
            <span className="font-semibold text-blue-800">{selectedIds.length} selected</span>
            <button
              onClick={() => handleBulkAction("Shortlisted")}
              disabled={bulkBusy}
              aria-label="Shortlist selected candidates"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Shortlist Selected
            </button>
            <button
              onClick={() => handleBulkAction("Pending Review")}
              disabled={bulkBusy}
              aria-label="Move selected candidates to review"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Move to Review
            </button>
            <button
              onClick={() => handleBulkAction("Interview Scheduled")}
              disabled={bulkBusy}
              aria-label="Move selected candidates to interview"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Move to Interview
            </button>
            <button
              onClick={() => handleBulkAction("On Hold")}
              disabled={bulkBusy}
              aria-label="Put selected candidates on hold"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Put On Hold
            </button>
            <button
              onClick={() => handleBulkAction("Hired")}
              disabled={bulkBusy}
              aria-label="Mark selected candidates as hired"
              className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
            >
              Mark Hired
            </button>
            <button
              onClick={() => handleBulkAction("Rejected")}
              disabled={bulkBusy}
              aria-label="Reject selected candidates"
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Reject Selected
            </button>
            {/* Phase 16 Milestone 9, §3 — server-side ownership is re-verified on every request (candidateService.listByIds); this link can never export a candidate the recruiter doesn't own, regardless of what's selected here. */}
            <button
              type="button"
              onClick={() => handleExport("selected-csv", `/api/ai/recruiter/export?format=csv&candidateIds=${selectedIds.join(",")}`, "candidates.csv")}
              disabled={pendingExport === "selected-csv"}
              aria-label="Export selected candidates as CSV"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingExport === "selected-csv" ? "Exporting..." : "Export Selected (CSV)"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("selected-excel", `/api/ai/recruiter/export?format=excel&candidateIds=${selectedIds.join(",")}`, "candidates.xlsx")}
              disabled={pendingExport === "selected-excel"}
              aria-label="Export selected candidates as XLSX"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingExport === "selected-excel" ? "Exporting..." : "Export Selected (Excel)"}
            </button>
          </div>
          {bulkEntitlementError && (
            <UpgradePrompt
              featureLabel="Bulk Status Update"
              code={bulkEntitlementError.code}
              featureId={bulkEntitlementError.featureId}
              message={bulkEntitlementError.message}
              limit={bulkEntitlementError.limit}
              used={bulkEntitlementError.used}
              period={bulkEntitlementError.period}
              onRetry={lastBulkStatus ? () => handleBulkAction(lastBulkStatus) : undefined}
            />
          )}

          {bulkError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {bulkError}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Loading candidates...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No candidates match these filters yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1420px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filtered.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all visible candidates"
                  />
                </th>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Experience</th>
                <th className="px-4 py-3">Skills</th>
                <th className="px-4 py-3">ATS</th>
                <th className="px-4 py-3">JD Match</th>
                <th className="px-4 py-3">Fit</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Evaluation</th>
                <th className="px-4 py-3">Last Evaluated</th>
                <th className="px-4 py-3">Interview Readiness</th>
                {scope === "interview" && <th className="px-4 py-3">Eligibility</th>}
                <th className="px-4 py-3">Recommended Action</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filtered.map((candidate) => {
                const evaluation = EVALUATION_STATUS_DISPLAY[candidate.evaluationStatus];
                const eligibility = scope === "interview" ? buildInterviewEligibility(candidate) : null;
                const canMoveToInterview =
                  candidate.status !== "Interview Scheduled" && ALLOWED_STATUS_TRANSITIONS[candidate.status].includes("Interview Scheduled");

                return (
                  <tr key={candidate.candidateId} className="hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(candidate.candidateId)}
                        onChange={() => toggleSelect(candidate.candidateId)}
                        aria-label={`Select ${candidate.name} for bulk actions`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{candidate.name}</p>
                      <p className="text-xs text-slate-500">
                        {candidate.currentRole ?? "Role unknown"} {candidate.currentCompany ? `at ${candidate.currentCompany}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{candidate.jobId ? jobById.get(candidate.jobId)?.title ?? "—" : "Unattached"}</td>
                    <td className="px-4 py-3 text-slate-600">{candidate.experienceYears ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[160px] flex-wrap gap-1">
                        {candidate.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {tag}
                          </span>
                        ))}
                        {candidate.tags.length === 0 && <span className="text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{candidate.scores.atsScore ?? "Not Evaluated"}</td>
                    <td className="px-4 py-3 text-slate-600">{candidate.scores.jdMatch !== null ? `${candidate.scores.jdMatch}%` : "Not Evaluated"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{candidate.fitScore}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${FIT_LEVEL_CLASSNAME[candidate.fitLevel]}`}
                        aria-label={`Fit level: ${candidate.fitLevel}`}
                      >
                        {candidate.fitLevel}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${evaluation.className}`} aria-label={`Evaluation status: ${evaluation.label}`}>
                      {evaluation.icon} {evaluation.label}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {candidate.evaluatedAt ? new Date(candidate.evaluatedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{candidate.scores.interviewReadiness ?? "Not available"}</td>
                    {scope === "interview" && eligibility && (
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            eligibility.eligible ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                          }`}
                          aria-label={`Interview eligibility for ${candidate.name}: ${eligibility.eligible ? "Eligible" : "Not eligible"}. ${[...eligibility.reasons, ...eligibility.warnings].join(" ")}`}
                          title={[...eligibility.reasons, ...eligibility.warnings].join(" | ")}
                        >
                          {eligibility.eligible ? "✓ Eligible" : "Not Eligible"}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 max-w-[200px] text-xs text-slate-600">{candidate.recommendedAction}</td>
                    <td className="px-4 py-3">
                      {/* Phase 16 Milestone 7, §1/§6 — only the current status plus its own valid next states are offered, so the dropdown never proposes a transition the server would reject. */}
                      <select
                        value={candidate.status}
                        onChange={(e) => onStatusChange(candidate.candidateId, e.target.value as CandidateStatus)}
                        aria-label={`Change status for ${candidate.name}`}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      >
                        {[candidate.status, ...ALLOWED_STATUS_TRANSITIONS[candidate.status]].map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {candidate.status === "Shortlisted" ? (
                          <button
                            onClick={() => onStatusChange(candidate.candidateId, "Pending Review")}
                            aria-label={`Remove ${candidate.name} from shortlist`}
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Unshortlist
                          </button>
                        ) : (
                          ALLOWED_STATUS_TRANSITIONS[candidate.status].includes("Shortlisted") && (
                            <button
                              onClick={() => onStatusChange(candidate.candidateId, "Shortlisted")}
                              aria-label={`Shortlist ${candidate.name}`}
                              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Shortlist
                            </button>
                          )
                        )}
                        {canMoveToInterview && (
                          <button
                            onClick={() => onStatusChange(candidate.candidateId, "Interview Scheduled")}
                            aria-label={`Move ${candidate.name} to interview`}
                            className="rounded-lg border border-blue-300 px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            Move to Interview
                          </button>
                        )}
                        {ALLOWED_STATUS_TRANSITIONS[candidate.status].includes("Rejected") && (
                          <button
                            onClick={() => onStatusChange(candidate.candidateId, "Rejected")}
                            aria-label={`Reject ${candidate.name}`}
                            className="rounded-lg border border-red-300 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            Reject
                          </button>
                        )}
                        <Link
                          href={`/recruiter/candidates/${candidate.candidateId}`}
                          aria-label={`View ${candidate.name}'s profile`}
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

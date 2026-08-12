"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { CandidateFitLevel } from "@/lib/ai/recruiter/candidate-types";
import type { AttentionPriority, RecruiterAnalytics } from "@/lib/ai/recruiter/recruiter-analytics-types";
import type { RecruiterJobRecord } from "@/lib/ai/recruiter/recruiter-job-types";

type Props = {
  jobs: RecruiterJobRecord[];
};

const FIT_LEVEL_CLASSNAME: Record<CandidateFitLevel, string> = {
  STRONG: "bg-green-100 text-green-700",
  GOOD: "bg-blue-100 text-blue-700",
  MODERATE: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

const ATTENTION_PRIORITY_CLASSNAME: Record<AttentionPriority, string> = {
  HIGH: "border-red-200 bg-red-50 text-red-700",
  INFORMATIONAL: "border-slate-200 bg-slate-50 text-slate-600",
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function pct(value: number | null): string {
  return value !== null ? `${value}%` : "Not Evaluated";
}

function score(value: number | null): string {
  return value !== null ? `${value}` : "Not Evaluated";
}

export default function RecruiterAnalyticsTab({ jobs }: Props) {
  const [selectedJobId, setSelectedJobId] = useState("");
  const [analytics, setAnalytics] = useState<RecruiterAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = selectedJobId ? `/api/ai/recruiter/analytics?jobId=${selectedJobId}` : "/api/ai/recruiter/analytics";
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Failed to load analytics");

      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [selectedJobId]);

  // Switching jobs only re-fetches already-computed, deterministic
  // analytics — never triggers an LLM call or creates a new version.
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Loading analytics...</div>;
  }

  if (error || !analytics) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 shadow-sm">
        {error ?? "Analytics unavailable."}
      </div>
    );
  }

  const {
    overall,
    fitDistribution,
    evaluationDistribution,
    conversionRates,
    interviewFunnel,
    statusDistribution,
    screeningFunnel,
    jobAnalytics,
    topCandidates,
    skillGaps,
    attentionQueue,
  } = analytics;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="mb-2 block text-xs font-semibold text-slate-500" htmlFor="analytics-job-select">
          Scope
        </label>
        <select
          id="analytics-job-select"
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
          className="w-full max-w-sm rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All jobs</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>
        {analytics.scope.job && (
          <p className="mt-2 text-sm text-slate-600">
            {analytics.scope.job.title}
            {analytics.scope.job.company ? ` — ${analytics.scope.job.company}` : ""}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Candidates" value={overall.totalCandidates} />
        <StatCard label="Jobs" value={overall.totalJobs} />
        <StatCard label="Evaluated" value={overall.evaluatedCandidates} />
        <StatCard label="Average JD Match" value={pct(overall.averageJdMatch)} />
        <StatCard label="Average ATS" value={score(overall.averageAtsScore)} />
        <StatCard label="Average Candidate Fit" value={score(overall.averageCandidateFit)} />
      </div>

      {/* Phase 16 Milestone 7, §9 — current-snapshot percentages (see ConversionRates' doc comment), not cohort/funnel conversion. */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Shortlist Rate" value={pct(conversionRates.shortlistRate)} />
        <StatCard label="Interview Rate" value={pct(conversionRates.interviewRate)} />
        <StatCard label="Hire Rate" value={pct(conversionRates.hireRate)} />
      </div>

      {/* Phase 16 Milestone 8, §9 — cohort metrics from decision_history (Milestone 7+ status changes only, see InterviewFunnelMetrics' doc comment), distinct from the current-snapshot percentages above. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Interview Funnel</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="In Interview" value={interviewFunnel.interviewCandidates} />
          <StatCard label="Interview-Eligible" value={interviewFunnel.interviewEligibleCandidates} />
          <StatCard label="Hires" value={interviewFunnel.hireCount} />
          <StatCard label="Shortlist → Interview" value={pct(interviewFunnel.shortlistToInterviewRate)} />
          <StatCard label="Interview → Hire" value={pct(interviewFunnel.interviewToHireRate)} />
          <StatCard label="Rejected After Interview" value={interviewFunnel.rejectedAfterInterviewCount} />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Cohort rates reflect status changes recorded since decision history was introduced — candidates whose stage changes all predate it won&apos;t appear in these rates.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Fit Distribution</h3>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center justify-between">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${FIT_LEVEL_CLASSNAME.STRONG}`}>Strong</span>
              <span className="font-semibold text-slate-800">{fitDistribution.strongCount}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${FIT_LEVEL_CLASSNAME.GOOD}`}>Good</span>
              <span className="font-semibold text-slate-800">{fitDistribution.goodCount}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${FIT_LEVEL_CLASSNAME.MODERATE}`}>Moderate</span>
              <span className="font-semibold text-slate-800">{fitDistribution.moderateCount}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${FIT_LEVEL_CLASSNAME.LOW}`}>Low</span>
              <span className="font-semibold text-slate-800">{fitDistribution.lowCount}</span>
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Evaluation</h3>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-green-700">✓ Evaluated</span>
              <span className="font-semibold text-slate-800">{evaluationDistribution.complete}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-400">○ Not Evaluated</span>
              <span className="font-semibold text-slate-800">{evaluationDistribution.notEvaluated}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-amber-700">⚠ Stale</span>
              <span className="font-semibold text-slate-800">{evaluationDistribution.stale}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Screening Funnel</h3>
        <ol className="space-y-1.5 text-sm">
          {screeningFunnel.map((stage) => (
            <li key={stage.stage} className="flex items-center justify-between">
              <span className="text-slate-700">{stage.stage}</span>
              <span className="font-semibold text-slate-800">{stage.count}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Candidate Status</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(statusDistribution).map(([status, count]) => (
            <div key={status} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
              <p className="text-[11px] uppercase text-slate-500">{status}</p>
              <p className="text-lg font-bold text-slate-800">{count}</p>
            </div>
          ))}
        </div>
      </div>

      {jobAnalytics.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Job-Level Screening Performance</h3>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs font-semibold uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-3">Job</th>
                <th className="px-2 py-2">Candidates</th>
                <th className="px-2 py-2">Evaluated</th>
                <th className="px-2 py-2">Avg JD Match</th>
                <th className="px-2 py-2">Avg ATS</th>
                <th className="px-2 py-2">Avg Fit</th>
                <th className="px-2 py-2">Stale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobAnalytics.map((job) => (
                <tr key={job.jobId}>
                  <td className="py-2 pr-3 font-medium text-slate-800">
                    {job.title}
                    {job.company ? ` — ${job.company}` : ""}
                  </td>
                  <td className="px-2 py-2 text-slate-600">{job.candidateCount}</td>
                  <td className="px-2 py-2 text-slate-600">{job.evaluatedCount}</td>
                  <td className="px-2 py-2 text-slate-600">{pct(job.averageJdMatch)}</td>
                  <td className="px-2 py-2 text-slate-600">{score(job.averageAtsScore)}</td>
                  <td className="px-2 py-2 text-slate-600">{score(job.averageCandidateFit)}</td>
                  <td className="px-2 py-2 text-slate-600">{job.staleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Top Candidates</h3>
        {topCandidates.length === 0 ? (
          <p className="text-sm text-slate-400">No evaluated candidates yet.</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs font-semibold uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-3">Candidate</th>
                <th className="px-2 py-2">JD Match</th>
                <th className="px-2 py-2">ATS</th>
                <th className="px-2 py-2">Fit</th>
                <th className="px-2 py-2">Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topCandidates.map((entry) => (
                <tr key={entry.candidateId}>
                  <td className="py-2 pr-3 font-medium text-slate-800">
                    <Link href={`/recruiter/candidates/${entry.candidateId}`} className="hover:underline">
                      {entry.summary.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-slate-600">{pct(entry.summary.scores.jdMatch)}</td>
                  <td className="px-2 py-2 text-slate-600">{score(entry.summary.scores.atsScore)}</td>
                  <td className="px-2 py-2 font-semibold text-slate-800">{entry.rankingScore}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${FIT_LEVEL_CLASSNAME[entry.level]}`}>{entry.level}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Skill Gaps</h3>
        {!analytics.scope.jobId ? (
          <p className="text-sm text-slate-400">Select a job above to see its missing-skill breakdown — skill gaps are relative to one job&apos;s requirements.</p>
        ) : skillGaps.length === 0 ? (
          <p className="text-sm text-slate-400">No missing-skill data yet for this job&apos;s candidates.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {skillGaps.slice(0, 10).map((gap) => (
              <li key={gap.skill} className="flex items-center justify-between">
                <span className="text-slate-700">{gap.skill}</span>
                <span className="text-slate-500">
                  {gap.missingCount} candidate{gap.missingCount === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Recruiter Attention</h3>
        {attentionQueue.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing needs attention right now.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {attentionQueue.map((item, index) => (
              <li key={`${item.candidateId}-${index}`} className={`rounded-lg border p-3 ${ATTENTION_PRIORITY_CLASSNAME[item.priority]}`}>
                <Link href={`/recruiter/candidates/${item.candidateId}`} className="font-semibold hover:underline">
                  {item.candidateName}
                </Link>
                <span className="ml-2 text-xs">— {item.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

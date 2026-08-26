"use client";

import { useCallback, useEffect, useState } from "react";

import ChatBox from "@/components/ai/ChatBox";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import RecruiterAnalyticsTab from "@/components/recruiter/RecruiterAnalyticsTab";
import RecruiterDashboardTab from "@/components/recruiter/RecruiterDashboardTab";
import RecruiterCandidateTable from "@/components/recruiter/RecruiterCandidateTable";
import RecruiterComparisonTab from "@/components/recruiter/RecruiterComparisonTab";
import RecruiterInsightsTab from "@/components/recruiter/RecruiterInsightsTab";
import RecruiterReportsTab from "@/components/recruiter/RecruiterReportsTab";
import { EntitlementAwareError, EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import type { CandidateStatus } from "@/lib/ai/recruiter/candidate-schema";
import type { CandidateFitLevel, CandidateSummary, DashboardSummary, RankedCandidate, TopCandidatesRecommendation } from "@/lib/ai/recruiter/candidate-types";
import type { RecruiterJobRecord } from "@/lib/ai/recruiter/recruiter-job-types";

// Phase 16 Milestone 1, §8 — visual treatment for classifyCandidateFitLevel()'s 4 tiers.
const FIT_LEVEL_CLASSNAME: Record<CandidateFitLevel, string> = {
  STRONG: "bg-green-100 text-green-700",
  GOOD: "bg-blue-100 text-blue-700",
  MODERATE: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

const SUGGESTIONS = [
  "Who is the strongest Java candidate?",
  "Who has Spring Boot experience?",
  "Recommend top 5 candidates",
  "Who is ready for interview?",
];

export default function RecruiterWorkspacePage() {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [ranking, setRanking] = useState<RankedCandidate[] | null>(null);
  const [recommendation, setRecommendation] = useState<TopCandidatesRecommendation | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendEntitlementError, setRecommendEntitlementError] = useState<EntitlementErrorInfo | null>(null);
  const [jobs, setJobs] = useState<RecruiterJobRecord[]>([]);

  // Phase 23 Milestone 3 — audit finding: requireRecruiterId() only
  // proves "signed in," never "holds the RECRUITER role" — every write
  // action below (create job, import, match, ...) independently enforces
  // recruiter.* entitlement and would reject a JOB_SEEKER-only account
  // with FEATURE_NOT_INCLUDED, with no self-service way to ever fix
  // that (see persona-service.ts's activateRecruiterPersona()). null =
  // still loading; this starts true so the gate below doesn't flash.
  const [isRecruiterRole, setIsRecruiterRole] = useState<boolean | null>(null);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const refreshRole = useCallback(async () => {
    const response = await fetch("/api/billing/platform/overview");
    const data = await response.json();
    if (response.ok) setIsRecruiterRole(Array.isArray(data.roles) && data.roles.includes("RECRUITER"));
  }, []);

  useEffect(() => {
    refreshRole();
  }, [refreshRole]);

  async function handleActivateRecruiter() {
    setActivating(true);
    setActivateError(null);
    try {
      const response = await fetch("/api/persona/recruiter/activate", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to activate the Recruiter Workspace.");
      setIsRecruiterRole(true);
    } catch (err) {
      setActivateError(err instanceof Error ? err.message : "Failed to activate the Recruiter Workspace.");
    } finally {
      setActivating(false);
    }
  }

  // Phase 21 Milestone 1 — audit finding: this function (and
  // refreshDashboard/refreshRanking below) applied the response body to
  // state unconditionally, unlike refreshJobs's own correct
  // `if (response.ok)` guard. An unauthorized/expired-session visitor
  // gets a 401 JSON error body ({error: "..."}) from these routes, which
  // was being set directly as `candidates`/`dashboard`/`ranking` — then
  // RecruiterCandidateTable's unconditional `candidates.filter(...)`
  // threw "candidates.filter is not a function", crashing to Next.js's
  // unstyled default error page (no error.tsx boundary exists in this
  // app) instead of a real "please sign in" message.
  const refreshCandidates = useCallback(async () => {
    setLoadingCandidates(true);
    try {
      const response = await fetch("/api/ai/recruiter/candidates");
      const data = await response.json();
      if (response.ok) setCandidates(data);
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    const response = await fetch("/api/ai/recruiter/jobs");
    const data = await response.json();
    if (response.ok) setJobs(data);
  }, []);

  const refreshDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    try {
      const response = await fetch("/api/ai/recruiter/dashboard");
      const data = await response.json();
      if (response.ok) setDashboard(data);
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  const refreshRanking = useCallback(async () => {
    const response = await fetch("/api/ai/recruiter/ranking");
    const data = await response.json();
    if (response.ok) setRanking(data);
  }, []);

  useEffect(() => {
    refreshCandidates();
    refreshDashboard();
    refreshRanking();
    refreshJobs();
  }, [refreshCandidates, refreshDashboard, refreshRanking, refreshJobs]);

  async function handleStatusChange(candidateId: string, status: CandidateStatus) {
    const response = await fetch(`/api/ai/recruiter/candidates/${candidateId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (response.ok) {
      refreshCandidates();
      refreshDashboard();
    } else {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Status update failed.");
    }
  }

  // Phase 16 Milestone 7, §4/§24 — throws on failure (rather than
  // silently no-op'ing) so RecruiterCandidateTable's bulk action bar
  // can surface exactly why the whole batch was rejected (e.g. one
  // selected candidate can't legally reach the target status).
  async function handleBulkStatusChange(candidateIds: string[], status: CandidateStatus) {
    const response = await fetch("/api/ai/recruiter/candidates/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateIds, status }),
    });

    if (response.ok) {
      await refreshCandidates();
      await refreshDashboard();
    } else {
      const data = await response.json().catch(() => ({}));
      // Phase 19 M4, Step 5 — carries the entitlement shape through this
      // throw so RecruiterCandidateTable's catch block (which only ever
      // sees an Error, not the raw response) can still render
      // UpgradePrompt instead of a plain string for a genuine
      // FEATURE_NOT_INCLUDED/QUOTA_EXCEEDED/AUTH_REQUIRED rejection.
      const entitlement = readEntitlementError(data, "Bulk status update failed.");
      if (entitlement) throw new EntitlementAwareError(entitlement);
      throw new Error(data.error || "Bulk status update failed.");
    }
  }

  async function handleRecommend() {
    setRecommendLoading(true);
    setRecommendEntitlementError(null);
    try {
      const response = await fetch("/api/ai/recruiter/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topN: 5 }),
      });
      const data = await response.json();
      if (response.ok) {
        setRecommendation(data);
        return;
      }
      const entitlement = readEntitlementError(data, "Recommendation failed.");
      if (entitlement) setRecommendEntitlementError(entitlement);
    } finally {
      setRecommendLoading(false);
    }
  }

  const tabs: TabItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      content: (
        <RecruiterDashboardTab
          dashboard={dashboard}
          loadingDashboard={loadingDashboard}
          candidates={candidates}
          onRefreshDashboard={refreshDashboard}
          onImported={() => {
            refreshCandidates();
            refreshRanking();
          }}
        />
      ),
    },
    {
      id: "candidates",
      label: "Candidates",
      content: (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-700">Ranking &amp; Recommendations</h3>
              <button
                onClick={handleRecommend}
                disabled={recommendLoading}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {recommendLoading ? "Thinking..." : "Recommend Top 5"}
              </button>
            </div>

            {ranking && ranking.length > 0 ? (
              <ol className="space-y-1 text-sm text-slate-700">
                {ranking.slice(0, 10).map((item) => (
                  <li key={item.candidateId} className="flex items-center gap-2">
                    <span>
                      #{item.rank} {item.summary.name}
                    </span>
                    <span aria-label="Candidate fit score" className="font-semibold">
                      {item.rankingScore}/100
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${FIT_LEVEL_CLASSNAME[item.level]}`}
                      aria-label={`Candidate fit level: ${item.level}`}
                    >
                      {item.level}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-400">Import candidates to see a ranking.</p>
            )}

            {recommendation && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">{recommendation.summary}</div>
            )}

            {recommendEntitlementError && (
              <UpgradePrompt
                featureLabel="Top Candidate Recommendations"
                code={recommendEntitlementError.code}
                featureId={recommendEntitlementError.featureId}
                message={recommendEntitlementError.message}
                limit={recommendEntitlementError.limit}
                used={recommendEntitlementError.used}
                period={recommendEntitlementError.period}
                onRetry={handleRecommend}
                className="mt-4"
              />
            )}
          </div>

          <RecruiterCandidateTable
            candidates={candidates}
            jobs={jobs}
            loading={loadingCandidates}
            onStatusChange={handleStatusChange}
            onBulkStatusChange={handleBulkStatusChange}
          />
        </div>
      ),
    },
    {
      id: "interview-queue",
      label: "Interview Queue",
      content: (
        <RecruiterCandidateTable
          candidates={candidates}
          jobs={jobs}
          loading={loadingCandidates}
          onStatusChange={handleStatusChange}
          onBulkStatusChange={handleBulkStatusChange}
          scope="interview"
        />
      ),
    },
    { id: "comparison", label: "Comparison", content: <RecruiterComparisonTab candidates={candidates} jobs={jobs} /> },
    { id: "analytics", label: "Analytics", content: <RecruiterAnalyticsTab jobs={jobs} /> },
    { id: "insights", label: "Insights", content: <RecruiterInsightsTab candidates={candidates} /> },
    { id: "reports", label: "Reports", content: <RecruiterReportsTab candidates={candidates} jobs={jobs} /> },
  ];

  if (isRecruiterRole === false) {
    return (
      <section className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Recruiter Workspace</p>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Activate your Recruiter Workspace</h1>
          <p className="mt-3 text-sm text-slate-600">
            Post jobs, import candidates, screen against a job description, rank, shortlist, and export reports —
            free to start, no organization required.
          </p>
          <button
            type="button"
            onClick={handleActivateRecruiter}
            disabled={activating}
            className="mt-6 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {activating ? "Activating..." : "Activate Recruiter Workspace"}
          </button>
          {activateError && <p className="mt-3 text-sm text-red-600">{activateError}</p>}
        </div>
      </section>
    );
  }

  if (isRecruiterRole === null) {
    return (
      <section className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading your Recruiter Workspace…</p>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Recruiter Workspace</p>
          <h1 className="mt-4 text-4xl font-bold text-slate-950 sm:text-5xl">Manage, compare, and shortlist candidates at scale</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Import resumes, screen them against one job description, rank and compare candidates, and generate AI
            insights — grounded in real resume data, never fabricated.
          </p>
        </div>

        <div className="space-y-6">
          <Tabs tabs={tabs} defaultTabId="dashboard" />

          <ChatBox
            recruiterMode
            title="Recruiter Assistant"
            subtitle='Try "who is the strongest Java candidate?" or "recommend top 5 candidates"'
            placeholder="Ask about candidates in your workspace..."
            suggestions={SUGGESTIONS}
            emptyStateTitle="Chat alongside your workspace"
            emptyStateBody="Ask about the strongest candidate in a skill, who has a specific technology, comparisons, or recommendations."
          />
        </div>
      </div>
    </section>
  );
}

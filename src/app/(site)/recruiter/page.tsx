"use client";

import { useCallback, useEffect, useState } from "react";

import ChatBox from "@/components/ai/ChatBox";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import RecruiterDashboardTab from "@/components/recruiter/RecruiterDashboardTab";
import RecruiterCandidateTable from "@/components/recruiter/RecruiterCandidateTable";
import RecruiterComparisonTab from "@/components/recruiter/RecruiterComparisonTab";
import RecruiterInsightsTab from "@/components/recruiter/RecruiterInsightsTab";
import RecruiterReportsTab from "@/components/recruiter/RecruiterReportsTab";
import type { CandidateStatus } from "@/lib/ai/recruiter/candidate-schema";
import type { CandidateSummary, DashboardSummary, RankedCandidate, TopCandidatesRecommendation } from "@/lib/ai/recruiter/candidate-types";

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

  const refreshCandidates = useCallback(async () => {
    setLoadingCandidates(true);
    try {
      const response = await fetch("/api/ai/recruiter/candidates");
      const data = await response.json();
      setCandidates(data);
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    try {
      const response = await fetch("/api/ai/recruiter/dashboard");
      const data = await response.json();
      setDashboard(data);
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  const refreshRanking = useCallback(async () => {
    const response = await fetch("/api/ai/recruiter/ranking");
    const data = await response.json();
    setRanking(data);
  }, []);

  useEffect(() => {
    refreshCandidates();
    refreshDashboard();
    refreshRanking();
  }, [refreshCandidates, refreshDashboard, refreshRanking]);

  async function handleStatusChange(candidateId: string, status: CandidateStatus) {
    const response = await fetch(`/api/ai/recruiter/candidates/${candidateId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (response.ok) {
      refreshCandidates();
      refreshDashboard();
    }
  }

  async function handleRecommend() {
    setRecommendLoading(true);
    try {
      const response = await fetch("/api/ai/recruiter/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topN: 5 }),
      });
      const data = await response.json();
      if (response.ok) setRecommendation(data);
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
                  <li key={item.candidateId}>
                    #{item.rank} {item.summary.name} — score {item.rankingScore}/100
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-400">Import candidates to see a ranking.</p>
            )}

            {recommendation && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">{recommendation.summary}</div>
            )}
          </div>

          <RecruiterCandidateTable candidates={candidates} loading={loadingCandidates} onStatusChange={handleStatusChange} />
        </div>
      ),
    },
    { id: "comparison", label: "Comparison", content: <RecruiterComparisonTab candidates={candidates} /> },
    { id: "insights", label: "Insights", content: <RecruiterInsightsTab candidates={candidates} /> },
    { id: "reports", label: "Reports", content: <RecruiterReportsTab candidates={candidates} /> },
  ];

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

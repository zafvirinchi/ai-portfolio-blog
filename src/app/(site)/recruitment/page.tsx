"use client";

import { useCallback, useEffect, useState } from "react";

import ChatBox from "@/components/ai/ChatBox";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import RecruitmentJobsTab from "@/components/recruitment/RecruitmentJobsTab";
import RecruitmentPipelineTab from "@/components/recruitment/RecruitmentPipelineTab";
import RecruitmentCandidatesTab from "@/components/recruitment/RecruitmentCandidatesTab";
import RecruitmentInterviewsTab from "@/components/recruitment/RecruitmentInterviewsTab";
import RecruitmentOffersTab from "@/components/recruitment/RecruitmentOffersTab";
import RecruitmentAnalyticsTab from "@/components/recruitment/RecruitmentAnalyticsTab";
import RecruitmentInsightsTab from "@/components/recruitment/RecruitmentInsightsTab";
import type { Job } from "@/lib/ai/recruitment/pipeline-types";

const SUGGESTIONS = [
  "Show top Java candidates",
  "Which candidates are ready for HR round?",
  "Who has been waiting longest?",
  "Show hiring funnel",
];

export default function RecruitmentPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const refreshJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const response = await fetch("/api/ai/recruitment/jobs");
      setJobs(await response.json());
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  const selectedJob = jobs.find((job) => job.jobId === selectedJobId) ?? null;

  const tabs: TabItem[] = [
    {
      id: "jobs",
      label: "Jobs",
      content: <RecruitmentJobsTab jobs={jobs} loading={loadingJobs} selectedJobId={selectedJobId} onSelectJob={setSelectedJobId} onRefresh={refreshJobs} />,
    },
    { id: "pipeline", label: "Pipeline", content: <RecruitmentPipelineTab jobId={selectedJobId} /> },
    { id: "candidates", label: "Candidates", content: <RecruitmentCandidatesTab jobId={selectedJobId} /> },
    { id: "interviews", label: "Interviews", content: <RecruitmentInterviewsTab jobId={selectedJobId} /> },
    { id: "offers", label: "Offers", content: <RecruitmentOffersTab jobId={selectedJobId} /> },
    { id: "analytics", label: "Analytics", content: <RecruitmentAnalyticsTab jobId={selectedJobId} /> },
    { id: "ai-insights", label: "AI Insights", content: <RecruitmentInsightsTab jobId={selectedJobId} /> },
  ];

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">AI Recruitment Pipeline</p>
          <h1 className="mt-4 text-4xl font-bold text-slate-950 sm:text-5xl">Jobs, hiring stages, interviews, and offers in one place</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Create job openings, move candidates through a Kanban hiring pipeline, schedule interviews, generate
            job-specific AI hiring recommendations, and track your hiring funnel — built on top of the Recruiter
            Workspace&apos;s candidate pool.
          </p>
        </div>

        {selectedJob && (
          <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-800">
            Working on: {selectedJob.title} ({selectedJob.status})
          </div>
        )}

        <div className="space-y-6">
          <Tabs tabs={tabs} defaultTabId="jobs" />

          <ChatBox
            recruitmentMode
            title="Recruitment Pipeline Assistant"
            subtitle='Try "show top Java candidates" or "show hiring funnel"'
            placeholder="Ask about jobs, pipeline stages, interviews, or the hiring funnel..."
            suggestions={SUGGESTIONS}
            emptyStateTitle="Chat alongside your hiring pipeline"
            emptyStateBody="You can also use the tabs above directly."
          />
        </div>
      </div>
    </section>
  );
}

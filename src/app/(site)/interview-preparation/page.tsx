"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import Tabs, { TabItem } from "@/components/ui/Tabs";
import PrepOverview from "@/components/interview-prep/PrepOverview";
import PrepTechnicalQuestions from "@/components/interview-prep/PrepTechnicalQuestions";
import PrepHrQuestions from "@/components/interview-prep/PrepHrQuestions";
import PrepProjectQuestions from "@/components/interview-prep/PrepProjectQuestions";
import PrepSystemDesign from "@/components/interview-prep/PrepSystemDesign";
import PrepCoding from "@/components/interview-prep/PrepCoding";
import PrepWeaknesses from "@/components/interview-prep/PrepWeaknesses";
import PrepLearningRoadmap from "@/components/interview-prep/PrepLearningRoadmap";
import PrepCheatSheet from "@/components/interview-prep/PrepCheatSheet";
import type { PrepRecord } from "@/lib/ai/interview-prep/prep-types";

function InterviewPreparationContent() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("resumeId");
  const jdMatchId = searchParams.get("jdMatchId");

  const [record, setRecord] = useState<PrepRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!resumeId || !jdMatchId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/interview-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, jdMatchId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Interview preparation failed");
      }

      setRecord(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Interview preparation failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!resumeId || !jdMatchId) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Upload a resume and match it against a job first</p>
        <p className="mt-2 text-sm text-slate-600">
          Interview preparation needs both a parsed resume and a job description match to personalize its
          questions.
        </p>
        <Link
          href="/resume-analyzer"
          className="mt-5 inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Go to Resume Analyzer
        </Link>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Generate your interview preparation report</p>
        <p className="mt-2 text-sm text-slate-600">
          Personalized technical, HR, project, and system-design questions with ideal answers, a readiness score,
          a weakness analysis, a learning roadmap, and a cheat sheet.
        </p>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mt-5 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Preparing..." : "Generate Interview Preparation"}
        </button>
        {error && (
          <div className="mx-auto mt-4 max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  const { report } = record;

  const tabs: TabItem[] = [
    { id: "overview", label: "Overview", content: <PrepOverview report={report} /> },
    { id: "technical", label: "Technical", content: <PrepTechnicalQuestions report={report} /> },
    { id: "hr", label: "HR", content: <PrepHrQuestions report={report} /> },
    { id: "projects", label: "Projects", content: <PrepProjectQuestions report={report} /> },
    { id: "system-design", label: "System Design", content: <PrepSystemDesign report={report} /> },
    { id: "coding", label: "Coding", content: <PrepCoding report={report} /> },
    { id: "weaknesses", label: "Weaknesses", content: <PrepWeaknesses report={report} /> },
    { id: "learning-plan", label: "Learning Plan", content: <PrepLearningRoadmap report={report} /> },
    { id: "cheat-sheet", label: "Cheat Sheet", content: <PrepCheatSheet report={report} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">
          Readiness score: <span className="text-blue-600">{report.readinessScore.overall}/100</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/mock-interview?resumeId=${resumeId}&jdMatchId=${jdMatchId}&prepId=${record.prepId}`}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Start Mock Interview
          </Link>
          {(["markdown", "pdf", "docx"] as const).map((format) => (
            <a
              key={format}
              href={`/api/ai/interview-prep/${record.prepId}/export?format=${format}`}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {format === "markdown" ? "Markdown" : format.toUpperCase()}
            </a>
          ))}
        </div>
      </div>

      <Tabs tabs={tabs} />
    </div>
  );
}

export default function InterviewPreparationPage() {
  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Interview Preparation</p>

          <h1 className="mt-4 text-4xl font-bold text-slate-950 sm:text-5xl">
            Prepare for your interview with a personalized plan
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Combines your resume and the matched job description into technical, HR, project, and system-design
            questions with ideal answers, a readiness score, and a day-by-day learning roadmap.
          </p>
        </div>

        <Suspense fallback={null}>
          <InterviewPreparationContent />
        </Suspense>
      </div>
    </section>
  );
}

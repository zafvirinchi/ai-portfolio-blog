"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import Tabs, { TabItem } from "@/components/ui/Tabs";
import PrepOverview from "@/components/interview-prep/PrepOverview";
import PrepPracticeTab from "@/components/interview-prep/PrepPracticeTab";
import PrepTechnicalQuestions from "@/components/interview-prep/PrepTechnicalQuestions";
import PrepHrQuestions from "@/components/interview-prep/PrepHrQuestions";
import PrepProjectQuestions from "@/components/interview-prep/PrepProjectQuestions";
import PrepSystemDesign from "@/components/interview-prep/PrepSystemDesign";
import PrepCoding from "@/components/interview-prep/PrepCoding";
import PrepWeaknesses from "@/components/interview-prep/PrepWeaknesses";
import PrepLearningRoadmap from "@/components/interview-prep/PrepLearningRoadmap";
import PrepCheatSheet from "@/components/interview-prep/PrepCheatSheet";
import type { PrepRecord } from "@/lib/ai/interview-prep/prep-types";
import type { InterviewIntelligence } from "@/lib/ai/interview-prep/interview-intelligence-service";

function InterviewPreparationContent() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("resumeId");
  const jdMatchId = searchParams.get("jdMatchId");
  // Phase 17 Milestone 2 — the Dynamic Resume Version entry point. Only
  // an opaque UUID ever appears in the URL, never resume content itself.
  const resumeVersionId = searchParams.get("resumeVersionId");
  // Phase 17 Milestone 7 — the missing link Mock Interview's Debrief/
  // Progress tabs need: a way to return to the EXACT report their
  // coverage/study-plan data already came from, instead of only ever
  // being able to generate a brand-new, disconnected one.
  const existingPrepId = searchParams.get("prepId");

  const [record, setRecord] = useState<PrepRecord | null>(null);
  const [checkingExistingPrep, setCheckingExistingPrep] = useState(!!existingPrepId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [intelligence, setIntelligence] = useState<InterviewIntelligence | null>(null);

  // Loads an already-generated report by id when one is linked in the URL.
  // Fails safe, never guesses: an expired/invalid prepId just falls
  // through to the normal "Generate a new report" screen below, exactly
  // as if no prepId had been given at all — never a broken or blank page.
  useEffect(() => {
    if (!existingPrepId) return;

    fetch(`/api/ai/interview-prep/${existingPrepId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setRecord(data);
      })
      .catch(() => undefined)
      .finally(() => setCheckingExistingPrep(false));
  }, [existingPrepId]);

  // Phase 17 Milestone 3 — fetched once the report exists, from the new
  // read-only, deterministic, zero-LLM coverage endpoint. Failure here
  // never blocks the rest of the page — PrepOverview renders fine
  // without it (intelligence stays null), just without the new
  // Coverage/Preparation Plan sections.
  useEffect(() => {
    if (!record) {
      setIntelligence(null);
      return;
    }

    fetch(`/api/ai/interview-prep/${record.prepId}/coverage`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setIntelligence)
      .catch(() => setIntelligence(null));
  }, [record]);

  async function handleGenerate() {
    if (!resumeVersionId && (!resumeId || !jdMatchId)) return;

    setLoading(true);
    setError(null);
    setEntitlementError(null);

    try {
      const body = resumeVersionId
        ? { resumeVersionId, jobDescriptionText: jobDescriptionText.trim() || undefined }
        : { resumeId, jdMatchId };

      const response = await fetch("/api/ai/interview-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Interview preparation failed");
        if (entitlement) {
          setEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Interview preparation failed");
      }

      setRecord(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Interview preparation failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!resumeVersionId && (!resumeId || !jdMatchId)) {
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

  if (checkingExistingPrep) {
    return (
      <div role="status" className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        Loading your interview preparation report...
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
        {resumeVersionId && (
          <div className="mx-auto mt-4 max-w-md text-left">
            <label className="mb-1 block text-xs font-semibold text-slate-500" htmlFor="prep-jd-text">
              Job description (only needed if this resume version doesn&apos;t already have one attached)
            </label>
            <textarea
              id="prep-jd-text"
              value={jobDescriptionText}
              onChange={(e) => setJobDescriptionText(e.target.value)}
              rows={4}
              placeholder="Paste a job description here if this version isn't already JD-optimized..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
        )}
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mt-5 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Preparing..." : "Generate Interview Preparation"}
        </button>
        {entitlementError ? (
          <UpgradePrompt
            className="mx-auto mt-4 max-w-xl text-left"
            featureLabel="Interview Preparation"
            code={entitlementError.code}
          featureId={entitlementError.featureId}
            message={entitlementError.message}
            limit={entitlementError.limit}
            used={entitlementError.used}
            period={entitlementError.period}
          />
        ) : (
          error && (
            <div role="alert" className="mx-auto mt-4 max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )
        )}
      </div>
    );
  }

  const { report } = record;

  const tabs: TabItem[] = [
    { id: "overview", label: "Overview", content: <PrepOverview report={report} intelligence={intelligence} /> },
    ...(intelligence
      ? [
          {
            id: "practice",
            label: "Practice",
            content: (
              <PrepPracticeTab
                report={report}
                questions={intelligence.questions}
                studyPlan={intelligence.studyPlan}
                resumeId={record.resumeId}
                jdMatchId={record.jdMatchId}
                prepId={record.prepId}
              />
            ),
          },
        ]
      : []),
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
          {/* Phase 17 Milestone 2 — uses the PrepRecord's own resumeId/jdMatchId (always the ephemeral ids the report was actually generated from), not the page's raw query params, so this link is correct regardless of whether this session started from an upload or a Resume Version. */}
          <Link
            href={`/mock-interview?resumeId=${record.resumeId}&jdMatchId=${record.jdMatchId}&prepId=${record.prepId}`}
            aria-label="Start Mock Interview"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Start Mock Interview
          </Link>
          {(["markdown", "pdf", "docx"] as const).map((format) => (
            <a
              key={format}
              href={`/api/ai/interview-prep/${record.prepId}/export?format=${format}`}
              aria-label={`Export interview preparation report as ${format === "markdown" ? "Markdown" : format.toUpperCase()}`}
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

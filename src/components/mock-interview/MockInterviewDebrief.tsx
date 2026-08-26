"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import { READINESS_RECOMMENDATION_COPY } from "./readiness-presentation";
import type { SessionRecord } from "@/lib/ai/mock-interview/session-types";
import type {
  CategoryPerformance,
  CoverageImpactItem,
  DemonstrationStatus,
  PerformanceLevel,
  SessionDebrief,
} from "@/lib/ai/mock-interview/session-debrief";

type Props = {
  session: SessionRecord;
  resumeId: string;
  jdMatchId: string;
  prepId?: string;
};

const CATEGORY_LABEL: Record<CategoryPerformance["category"], string> = {
  technical: "Technical",
  resume: "Resume",
  jd: "Job Description",
  behavioral: "Behavioral",
  systemDesign: "System Design",
  coding: "Coding",
};

// The InterviewType MockInterviewSetup.tsx's own form already accepts —
// used only to pre-select a sensible starting type for the "Practice
// weak category" CTA, never a new interview-type taxonomy.
const INTERVIEW_TYPE_FOR_CATEGORY: Record<CategoryPerformance["category"], string> = {
  technical: "Technical",
  resume: "Project Deep Dive",
  jd: "Technical",
  behavioral: "Behavioral",
  systemDesign: "System Design",
  coding: "Coding Discussion",
};

const PERFORMANCE_BADGE_CLASSNAME: Record<PerformanceLevel, string> = {
  Strong: "bg-green-100 text-green-700",
  Moderate: "bg-amber-100 text-amber-700",
  "Needs Practice": "bg-red-100 text-red-700",
  "Not Assessed": "bg-slate-100 text-slate-500",
};

const STATUS_BADGE_CLASSNAME: Record<DemonstrationStatus, string> = {
  Demonstrated: "bg-green-100 text-green-700",
  "Partially demonstrated": "bg-amber-100 text-amber-700",
  "Not demonstrated": "bg-red-100 text-red-700",
  "Not assessed": "bg-slate-100 text-slate-500",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

function CoverageItemList({ title, items, emptyText }: { title: string; items: CoverageImpactItem[]; emptyText: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={`${item.category}-${item.topic}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-700">{item.topic}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_BADGE_CLASSNAME[item.status]}`}>{item.status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">{emptyText}</p>
      )}
    </div>
  );
}

export default function MockInterviewDebrief({ session, resumeId, jdMatchId, prepId }: Props) {
  // A single result object, set only from inside the fetch's own .then()/
  // .catch() callbacks (never synchronously in the effect body) — "loading"
  // is simply derived as "no result yet". The parent page keys this
  // component by session.sessionId, so a new session remounts it fresh
  // (initial state below) instead of needing an effect-body reset, which
  // would otherwise re-introduce the same synchronous-setState-in-effect
  // problem this structure avoids.
  const [result, setResult] = useState<{ debrief: SessionDebrief | null; error: string | null }>({ debrief: null, error: null });
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);

  const isCompleted = session.status === "completed" && session.report !== null;
  const loading = isCompleted && !result.debrief && !result.error && !entitlementError;

  useEffect(() => {
    if (!isCompleted) return;

    let cancelled = false;

    fetch(`/api/ai/mock-interview/${session.sessionId}/debrief`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          // Phase 23 Milestone 5 — this route is gated by
          // requireFeature(..., "interview.debrief") (NONE on the Free
          // plan) — a rejection here was previously shown as a generic
          // error string instead of UpgradePrompt.
          const entitlement = readEntitlementError(data, "Failed to load session debrief");
          if (entitlement) {
            if (!cancelled) setEntitlementError(entitlement);
            return;
          }
          throw new Error(data.error || "Failed to load session debrief");
        }
        if (!cancelled) setResult({ debrief: data, error: null });
      })
      .catch((err) => {
        if (!cancelled) setResult({ debrief: null, error: err instanceof Error ? err.message : "Failed to load session debrief." });
      });

    return () => {
      cancelled = true;
    };
    // session.sessionId changes on restart; report flips from null to set exactly once, at end().
  }, [session.sessionId, isCompleted]);

  const { debrief, error } = result;

  if (!isCompleted) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        End the interview from the Interview tab to generate your session debrief.
      </div>
    );
  }

  if (loading) {
    return <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Building your debrief...</div>;
  }

  if (entitlementError) {
    return (
      <UpgradePrompt
        featureLabel="Session Debrief"
        code={entitlementError.code}
        featureId={entitlementError.featureId}
        message={entitlementError.message}
        limit={entitlementError.limit}
        used={entitlementError.used}
        period={entitlementError.period}
      />
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        {error}
      </div>
    );
  }

  if (!debrief) return null;

  const mockInterviewBaseHref = `/mock-interview?resumeId=${resumeId}&jdMatchId=${jdMatchId}${prepId ? `&prepId=${prepId}` : ""}`;
  // Phase 17 Milestone 7 — includes prepId (when known) so this actually
  // returns to the SAME report this debrief's own coverage data came
  // from, instead of landing on a blank "Generate a new report" screen.
  const dashboardHref = `/interview-preparation?resumeId=${resumeId}&jdMatchId=${jdMatchId}${prepId ? `&prepId=${prepId}` : ""}`;
  const readiness = READINESS_RECOMMENDATION_COPY[debrief.readinessRecommendation];

  const weakestCategory = [...debrief.categoryPerformance]
    .filter((category) => category.performanceLevel === "Needs Practice")
    .sort((a, b) => (a.averageScore ?? 0) - (b.averageScore ?? 0))[0];

  const weakCategoryHref = weakestCategory
    ? `${mockInterviewBaseHref}&interviewType=${encodeURIComponent(INTERVIEW_TYPE_FOR_CATEGORY[weakestCategory.category])}`
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Session Result</p>
            <p className="mt-1 text-4xl font-bold text-slate-900">{debrief.summary.overallScore}/100</p>
          </div>
          <span
            aria-label={`Readiness recommendation: ${readiness.label}`}
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${readiness.className}`}
          >
            {readiness.label}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Readiness" value={`${debrief.summary.readinessLevel}/100`} />
          <Stat label="Answered" value={`${debrief.summary.answeredQuestions}/${debrief.summary.totalQuestions}`} />
          <Stat label="Skipped" value={String(debrief.summary.skippedQuestions)} />
          <Stat label="Completion" value={`${debrief.summary.completionPercentage}%`} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700">Category Performance</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th scope="col" className="pb-2 font-semibold">Category</th>
                <th scope="col" className="pb-2 font-semibold">Performance</th>
                <th scope="col" className="pb-2 font-semibold">Answered</th>
              </tr>
            </thead>
            <tbody>
              {debrief.categoryPerformance.map((category) => (
                <tr key={category.category} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-700">{CATEGORY_LABEL[category.category]}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${PERFORMANCE_BADGE_CLASSNAME[category.performanceLevel]}`}>
                      {category.performanceLevel}
                    </span>
                  </td>
                  <td className="py-2 text-slate-500">
                    {category.questionsAnswered}/{category.questionsAsked}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {debrief.strongAreas && debrief.criticalWeaknesses && (
        <div className="grid gap-4 sm:grid-cols-2">
          <CoverageItemList title="What You Demonstrated" items={debrief.strongAreas} emptyText="No priority topics were clearly demonstrated in this session." />
          <CoverageItemList title="What Needs Practice" items={debrief.criticalWeaknesses} emptyText="No critical or high-priority gaps identified in this session." />
        </div>
      )}

      {debrief.coverageImpact ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700">Coverage Impact</h3>
          <p className="mt-1 text-xs text-slate-500">How this session&apos;s questions map onto your Interview Preparation coverage.</p>
          <div className="mt-4 space-y-2">
            {debrief.coverageImpact.map((item) => (
              <div key={`${item.category}-${item.topic}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <span className="font-medium text-slate-700">{item.topic}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${STATUS_BADGE_CLASSNAME[item.status]}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">{debrief.coverageUnavailableReason}</div>
      )}

      {debrief.updatedStudyPlan && debrief.updatedStudyPlan.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700">Updated Study Plan</h3>
          <p className="mt-1 text-xs text-slate-500">Reordered using this session&apos;s results — a sequence of steps, not a fixed calendar.</p>
          <ol className="mt-4 space-y-2">
            {debrief.updatedStudyPlan.map((entry) => (
              <li key={entry.step} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="text-slate-700">
                    <span className="font-semibold text-slate-400">{entry.step}.</span> {entry.topic}
                  </span>
                  {entry.moved && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">Moved Up</span>
                  )}
                </div>
                {entry.moveReason && <p className="mt-1 text-xs text-blue-700">{entry.moveReason}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Link
          href={mockInterviewBaseHref}
          aria-label="Start another mock interview"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Start Another Mock Interview
        </Link>
        {weakCategoryHref && weakestCategory && (
          <Link
            href={weakCategoryHref}
            aria-label={`Practice ${CATEGORY_LABEL[weakestCategory.category]} questions in a new mock interview`}
            className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Practice {CATEGORY_LABEL[weakestCategory.category]}
          </Link>
        )}
        <Link href={dashboardHref} aria-label="Review your study plan" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Review Study Plan
        </Link>
        <Link
          href={dashboardHref}
          aria-label="Return to the Interview Preparation dashboard"
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Return to Interview Dashboard
        </Link>
      </div>
    </div>
  );
}

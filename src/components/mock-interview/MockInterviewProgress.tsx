"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import { getRecentSessionIds } from "@/lib/ai/mock-interview/practice-history-store";
import { READINESS_RECOMMENDATION_COPY } from "./readiness-presentation";
import type { CategoryProgress, InterviewProgress, ProgressArea, Trend, TopicProgress } from "@/lib/ai/mock-interview/interview-progress";

type Props = {
  resumeId: string;
  jdMatchId: string;
  prepId?: string;
  /** The page's CURRENTLY loaded session, if any — used only to decide whether "View Latest Debrief" can safely point at the already-loaded Debrief tab (see the component body for why). */
  latestSessionId: string | null;
  /** Forces the page's Tabs to remount on the Debrief tab — see mock-interview/page.tsx's own comment on why this exists instead of a general Tabs control API. */
  onViewLatestDebrief?: () => void;
};

const CATEGORY_LABEL: Record<CategoryProgress["category"], string> = {
  technical: "Technical",
  resume: "Resume",
  jd: "Job Description",
  behavioral: "Behavioral",
  systemDesign: "System Design",
  coding: "Coding",
};

const INTERVIEW_TYPE_FOR_CATEGORY: Record<CategoryProgress["category"], string> = {
  technical: "Technical",
  resume: "Project Deep Dive",
  jd: "Technical",
  behavioral: "Behavioral",
  systemDesign: "System Design",
  coding: "Coding Discussion",
};

const TREND_BADGE_CLASSNAME: Record<Trend, string> = {
  IMPROVING: "bg-green-100 text-green-700",
  STABLE: "bg-slate-100 text-slate-600",
  DECLINING: "bg-red-100 text-red-700",
  INSUFFICIENT_DATA: "bg-slate-100 text-slate-400",
};

const TREND_LABEL: Record<Trend, string> = {
  IMPROVING: "Improving",
  STABLE: "Stable",
  DECLINING: "Declining",
  INSUFFICIENT_DATA: "Insufficient Data",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

function TopicList({ title, items, emptyText }: { title: string; items: TopicProgress[]; emptyText: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={`${item.category}-${item.topic}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-700">{item.topic}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TREND_BADGE_CLASSNAME[item.status === "PERSISTENT_WEAKNESS" ? "DECLINING" : item.status === "IMPROVING" ? "IMPROVING" : "STABLE"]}`}>
                  {item.status.replace("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Weak in {item.weakCount} of {item.assessedCount} assessed sessions — latest: {item.latestStatus}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">{emptyText}</p>
      )}
    </div>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "entitlement"; info: EntitlementErrorInfo }
  | { status: "loaded"; progress: InterviewProgress; recentIds: string[] };

export default function MockInterviewProgress({ resumeId, jdMatchId, prepId, latestSessionId, onViewLatestDebrief }: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    // Every setState call below runs inside a promise callback (never
    // synchronously in this effect's own body, including the localStorage
    // read) — see MockInterviewDebrief.tsx's identical fix for why.
    Promise.resolve().then(() => {
      if (cancelled) return;

      const ids = getRecentSessionIds({ resumeId, jdMatchId });

      if (ids.length === 0) {
        setState({ status: "empty" });
        return;
      }

      const params = new URLSearchParams({ sessionIds: ids.join(","), resumeId, jdMatchId });

      fetch(`/api/ai/mock-interview/progress?${params.toString()}`)
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) {
            // Phase 23 Milestone 5 — this route is gated by
            // requireFeature(..., "interview.progress") (NONE on the
            // Free plan) — a rejection here was previously shown as a
            // generic error string instead of UpgradePrompt.
            const entitlement = readEntitlementError(data, "Failed to load practice progress");
            if (entitlement) {
              if (!cancelled) setState({ status: "entitlement", info: entitlement });
              return;
            }
            throw new Error(data.error || "Failed to load practice progress");
          }
          if (!cancelled) setState({ status: "loaded", progress: data, recentIds: ids });
        })
        .catch((err) => {
          if (!cancelled) setState({ status: "error", message: err instanceof Error ? err.message : "Failed to load practice progress." });
        });
    });

    return () => {
      cancelled = true;
    };
    // latestSessionId changes whenever a session completes — re-reads localStorage and re-fetches so newly-finished sessions show up immediately.
  }, [resumeId, jdMatchId, latestSessionId]);

  const mockInterviewBaseHref = `/mock-interview?resumeId=${resumeId}&jdMatchId=${jdMatchId}${prepId ? `&prepId=${prepId}` : ""}`;
  // Phase 17 Milestone 7 — includes prepId (when known) so this returns to
  // the report this history's study-plan reprioritization actually used.
  const dashboardHref = `/interview-preparation?resumeId=${resumeId}&jdMatchId=${jdMatchId}${prepId ? `&prepId=${prepId}` : ""}`;

  if (state.status === "empty") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        Complete your first mock interview to start tracking progress.
        <div className="mt-4">
          <Link href={mockInterviewBaseHref} aria-label="Start mock interview" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Start Mock Interview
          </Link>
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Loading your practice progress...</div>;
  }

  if (state.status === "entitlement") {
    return (
      <UpgradePrompt
        featureLabel="Practice Progress"
        code={state.info.code}
        featureId={state.info.featureId}
        message={state.info.message}
        limit={state.info.limit}
        used={state.info.used}
        period={state.info.period}
      />
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
        {state.message}
      </div>
    );
  }

  const { progress, recentIds } = state;

  const weakestCategory = [...progress.decliningAreas].sort((a, b) => (a.latest ?? 0) - (b.latest ?? 0))[0];
  const weakCategoryHref = weakestCategory ? `${mockInterviewBaseHref}&interviewType=${encodeURIComponent(INTERVIEW_TYPE_FOR_CATEGORY[weakestCategory.category])}` : null;
  const canViewLatestDebrief = progress.sessionsCompleted > 0 && latestSessionId !== null && recentIds[recentIds.length - 1] === latestSessionId;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Practice Overview</p>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${TREND_BADGE_CLASSNAME[progress.trend]}`}>{TREND_LABEL[progress.trend]}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Sessions Completed" value={String(progress.sessionsCompleted)} />
          <Stat label="Latest Score" value={progress.latestScore !== null ? `${progress.latestScore}/100` : "—"} />
          <Stat label="Score Change" value={progress.scoreDelta !== null ? `${progress.scoreDelta > 0 ? "+" : ""}${progress.scoreDelta}` : "—"} />
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
            {progress.latestReadiness ? (
              <span
                aria-label={`Latest readiness recommendation: ${READINESS_RECOMMENDATION_COPY[progress.latestReadiness].label}`}
                className={`inline-block rounded-full px-2 py-1 text-[11px] font-bold uppercase ${READINESS_RECOMMENDATION_COPY[progress.latestReadiness].className}`}
              >
                {READINESS_RECOMMENDATION_COPY[progress.latestReadiness].label}
              </span>
            ) : (
              <p className="text-lg font-bold text-slate-900">—</p>
            )}
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Latest Readiness</p>
          </div>
        </div>

        {progress.sessionsCompleted === 1 && (
          <p className="mt-4 text-xs text-slate-500">More sessions are needed to establish a performance trend.</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700">Category Progress</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th scope="col" className="pb-2 font-semibold">Category</th>
                <th scope="col" className="pb-2 font-semibold">Latest</th>
                <th scope="col" className="pb-2 font-semibold">Trend</th>
              </tr>
            </thead>
            <tbody>
              {progress.categoryProgress.map((category) => (
                <tr key={category.category} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-700">{CATEGORY_LABEL[category.category]}</td>
                  <td className="py-2 text-slate-500">{category.latest !== null ? category.latest : "—"}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TREND_BADGE_CLASSNAME[category.trend]}`}>{TREND_LABEL[category.trend]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TopicList title="Persistent Weak Areas" items={progress.persistentWeakAreas} emptyText="No persistent weak areas identified yet." />
        <TopicList title="Repeated Misses" items={progress.repeatedMisses} emptyText="No topics have repeatedly caused difficulty yet." />
      </div>

      {progress.improvingAreas.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Improving Areas</p>
          <ul className="space-y-1 text-sm text-green-700">
            {progress.improvingAreas.map((area: ProgressArea) => (
              <li key={area.category}>
                • {CATEGORY_LABEL[area.category]}: {area.previous} → {area.latest}
              </li>
            ))}
          </ul>
        </div>
      )}

      {progress.recommendedNextPractice.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Recommended Next Practice</p>
          <ul className="space-y-2">
            {progress.recommendedNextPractice.map((rec, index) => (
              <li key={`${rec.priority}-${rec.topicOrCategory}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${rec.priority === "HIGH" ? "bg-red-100 text-red-700" : rec.priority === "MEDIUM" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                  {rec.priority}
                </span>
                <span className="font-medium text-slate-700">{rec.topicOrCategory}</span>
                <span className="text-slate-500"> — {rec.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {progress.updatedStudyPlan && progress.updatedStudyPlan.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700">Updated Study Plan</h3>
          <p className="mt-1 text-xs text-slate-500">Reprioritized using your practice history — a sequence of steps, not a fixed calendar.</p>
          <ol className="mt-4 space-y-2">
            {progress.updatedStudyPlan.map((entry) => (
              <li key={entry.step} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="text-slate-700">
                    <span className="font-semibold text-slate-400">{entry.step}.</span> {entry.topic}
                  </span>
                  {entry.moved && <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">Moved Up</span>}
                </div>
                {entry.moveReason && <p className="mt-1 text-xs text-blue-700">{entry.moveReason}</p>}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        progress.studyPlanUnavailableReason && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">{progress.studyPlanUnavailableReason}</div>
        )
      )}

      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Link href={mockInterviewBaseHref} aria-label="Start another mock interview" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Start Mock Interview
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
        {canViewLatestDebrief && (
          <button
            type="button"
            onClick={onViewLatestDebrief}
            aria-label="View the latest session's debrief"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View Latest Debrief
          </button>
        )}
      </div>
    </div>
  );
}

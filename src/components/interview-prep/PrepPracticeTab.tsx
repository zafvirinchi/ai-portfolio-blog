"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { StarAnswer, TechnicalAnswer, InterviewPreparationReport } from "@/lib/ai/interview-prep/prep-schema";
import type { BrowsableQuestion, PriorityLevel, StudyPlanEntry, StudyPlanBucket } from "@/lib/ai/interview-prep/interview-coverage";
import { DEFAULT_QUESTION_FILTERS, filterQuestions, QuestionFilters } from "@/lib/ai/interview-prep/question-filters";
import QuestionAnswerCard from "./shared/QuestionAnswerCard";

type Props = {
  report: InterviewPreparationReport;
  questions: BrowsableQuestion[];
  studyPlan: StudyPlanEntry[];
  resumeId: string;
  jdMatchId: string;
  prepId: string;
};

const CATEGORY_OPTIONS: { value: BrowsableQuestion["category"] | "All"; label: string }[] = [
  { value: "All", label: "All" },
  { value: "technical", label: "Technical" },
  { value: "resume", label: "Resume" },
  { value: "jd", label: "Job Description" },
  { value: "systemDesign", label: "System Design" },
  { value: "behavioral", label: "Behavioral" },
];

const PRIORITY_OPTIONS: { value: PriorityLevel | "All"; label: string }[] = [
  { value: "All", label: "All" },
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const DIFFICULTY_OPTIONS = ["All", "Easy", "Medium", "Hard"];

const PRIORITY_BADGE_CLASSNAME: Record<PriorityLevel, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

const BUCKET_LABEL: Record<StudyPlanBucket, string> = { Today: "TODAY", Next: "NEXT", Later: "LATER" };

/** Looks up the real generated answer for a flattened question via its id scheme (technical-N / hr-N / project-N / system-design-N — the exact scheme flattenQuestionsForBrowsing() assigns) — never fabricates one. */
function resolveAnswer(question: BrowsableQuestion, report: InterviewPreparationReport): TechnicalAnswer | StarAnswer | string | null {
  const [kind, indexStr] = [question.id.replace(/-\d+$/, ""), question.id.match(/(\d+)$/)?.[1]];
  const index = indexStr ? Number(indexStr) : NaN;
  if (Number.isNaN(index)) return null;

  if (kind === "technical") {
    const item = report.technicalQuestions[index];
    if (!item) return null;
    return "source" in item ? item.answer : item.idealAnswer;
  }
  if (kind === "hr") return report.hrQuestions[index]?.idealAnswer ?? null;
  if (kind === "project") return report.projectQuestions[index]?.idealAnswer ?? null;
  if (kind === "system-design") return report.systemDesignQuestions[index]?.idealAnswer ?? null;

  return null;
}

export default function PrepPracticeTab({ report, questions, studyPlan, resumeId, jdMatchId, prepId }: Props) {
  const [filters, setFilters] = useState<QuestionFilters>(DEFAULT_QUESTION_FILTERS);

  const filtered = useMemo(() => filterQuestions(questions, filters), [questions, filters]);
  const criticalCount = questions.filter((q) => q.priority === "CRITICAL").length;

  const mockInterviewHref = `/mock-interview?resumeId=${resumeId}&jdMatchId=${jdMatchId}&prepId=${prepId}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Link href={mockInterviewHref} aria-label="Start mock interview" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Start Mock Interview
        </Link>
        {criticalCount > 0 && (
          <Link
            href={mockInterviewHref}
            aria-label="View critical interview questions and practice them in a mock interview"
            className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Practice Critical Questions ({criticalCount})
          </Link>
        )}
      </div>

      {studyPlan.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700">Recommended Study Plan</h3>
          <p className="mt-1 text-xs text-slate-500">Ordered by priority — a sequence of steps, not a fixed calendar.</p>
          <div className="mt-4 space-y-4">
            {(["Today", "Next", "Later"] as StudyPlanBucket[]).map((bucket) => {
              const entries = studyPlan.filter((entry) => entry.bucket === bucket);
              if (entries.length === 0) return null;

              return (
                <div key={bucket}>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500" aria-label={`${BUCKET_LABEL[bucket]} study steps`}>
                    {BUCKET_LABEL[bucket]}
                  </h4>
                  <ol className="mt-2 space-y-1.5">
                    {entries.map((entry) => (
                      <li key={entry.step} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="font-semibold text-slate-400">{entry.step}.</span>
                        <span>
                          {entry.topic}
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_BADGE_CLASSNAME[entry.priority]}`}>{entry.priority}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          placeholder="Search question, topic, or category..."
          aria-label="Search interview questions"
          className="min-w-[220px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <select
          value={filters.category}
          onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value as QuestionFilters["category"] }))}
          aria-label="Filter interview questions by category"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={filters.priority}
          onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value as QuestionFilters["priority"] }))}
          aria-label="Filter interview questions by priority"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={filters.difficulty}
          onChange={(e) => setFilters((prev) => ({ ...prev, difficulty: e.target.value }))}
          aria-label="Filter interview questions by difficulty"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          {DIFFICULTY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">No questions match these filters.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((question) => {
            const answer = resolveAnswer(question, report);
            const badge = `${question.priority} · ${question.topic}${question.difficulty ? ` · ${question.difficulty}` : ""}`;

            return answer ? (
              <div key={question.id}>
                <QuestionAnswerCard question={question.question} badge={badge} answer={answer} />
                <p className="mt-1 px-1 text-xs text-slate-400">{question.reason}</p>
              </div>
            ) : (
              <div key={question.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">{question.question}</p>
                  <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{badge}</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">{question.reason}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

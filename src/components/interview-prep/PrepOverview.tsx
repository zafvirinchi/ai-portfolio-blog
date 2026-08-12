import type { InterviewPreparationReport } from "@/lib/ai/interview-prep/prep-schema";
import type { InterviewIntelligence } from "@/lib/ai/interview-prep/interview-intelligence-service";
import type { PreparationTier } from "@/lib/ai/interview-prep/interview-coverage";
import PrepJdGapPanel from "./PrepJdGapPanel";
import PrepResumeEvidencePanel from "./PrepResumeEvidencePanel";

type Props = {
  report: InterviewPreparationReport;
  /** Phase 17 Milestone 3 — fetched separately (GET .../coverage), optional so this tab still renders gracefully while that request is in flight or if it fails. */
  intelligence?: InterviewIntelligence | null;
};

const TIER_ORDER: PreparationTier[] = ["Must Prepare", "High Priority", "Recommended", "Optional"];

const TIER_CLASSNAME: Record<PreparationTier, string> = {
  "Must Prepare": "border-red-200 bg-red-50 text-red-800",
  "High Priority": "border-orange-200 bg-orange-50 text-orange-800",
  Recommended: "border-amber-200 bg-amber-50 text-amber-800",
  Optional: "border-slate-200 bg-slate-50 text-slate-600",
};

const CATEGORY_LABEL: Record<string, string> = {
  technical: "Technical",
  resume: "Resume",
  jd: "Job Description",
  behavioral: "Behavioral",
  systemDesign: "System Design",
  coding: "Coding",
};

const SUB_SCORES: { key: keyof InterviewPreparationReport["readinessScore"]; label: string }[] = [
  { key: "resumeQuality", label: "Resume Quality" },
  { key: "jdMatch", label: "JD Match" },
  { key: "missingSkillsPenalty", label: "Skill Coverage" },
  { key: "projectsScore", label: "Projects" },
  { key: "experienceScore", label: "Experience" },
  { key: "atsScore", label: "ATS" },
  { key: "knowledgeBaseCoverage", label: "Knowledge Base Coverage" },
];

export default function PrepOverview({ report, intelligence }: Props) {
  const { readinessScore } = report;

  const stats = [
    { label: "Technical Questions", value: report.technicalQuestions.length },
    { label: "HR Questions", value: report.hrQuestions.length },
    { label: "Project Questions", value: report.projectQuestions.length },
    { label: "System Design", value: report.systemDesignQuestions.length },
  ];

  if (intelligence) {
    stats.push(
      { label: "Total Questions", value: intelligence.totals.totalQuestions },
      { label: "Critical Questions", value: intelligence.totals.criticalCount },
      { label: "High Priority Questions", value: intelligence.totals.highPriorityCount }
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Interview Readiness Score</p>
            <p className="mt-1 text-4xl font-bold text-slate-900">{readinessScore.overall}/100</p>
          </div>
          {/* Phase 17 Milestone 4, §2/§11 — a LABEL on the existing, unmodified readiness score, using the same 60-point threshold already established (candidate-interview.ts, Phase 16 M8) — never a second readiness algorithm. */}
          {intelligence && (
            <span
              aria-label={`Readiness status: ${intelligence.readinessLabel}`}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                intelligence.readinessLabel === "Ready for Interview" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {intelligence.readinessLabel}
            </span>
          )}
        </div>

        <div
          className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Interview readiness score"
          aria-valuenow={readinessScore.overall}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${readinessScore.overall}%` }} />
        </div>

        {intelligence && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Recommended Next Action</p>
            <p className="mt-1 text-sm text-blue-900">{intelligence.recommendedAction}</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {SUB_SCORES.map(({ key, label }) => (
            <div key={key}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600">{label}</span>
                <span className="font-semibold text-slate-900">{readinessScore[key]}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${readinessScore[key]}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Phase 17 Milestone 3 — deterministic coverage/priority/gap metadata (interview-coverage.ts), never fabricated: every "missing" entry is a real topic this JD/resume pairing calls for that no generated question currently addresses. */}
      {intelligence && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-700">Coverage</h3>
              {intelligence.overallCoveragePercent !== null && <span className="text-sm font-semibold text-slate-600">Overall: {intelligence.overallCoveragePercent}%</span>}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.entries(intelligence.coverage) as [string, { covered: string[]; missing: string[] }][]).map(([category, categoryCoverage]) => {
                const { covered, missing } = categoryCoverage;
                // Step 4 — a percentage only when the underlying model safely
                // supports one (covered+missing > 0); counts are shown either way,
                // never a fabricated percentage for an empty category. Computed
                // server-side (interview-intelligence-service.ts) and passed as
                // plain data — see that file's comment for why this component
                // must never import a runtime binding from interview-coverage.ts.
                const percent = intelligence.categoryCoveragePercents[category as keyof typeof intelligence.categoryCoveragePercents] ?? null;
                const label = CATEGORY_LABEL[category] ?? category;

                return (
                  <div key={category} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                      {percent !== null && <span className="text-xs font-semibold text-slate-600">{percent}%</span>}
                    </div>
                    {percent !== null && (
                      <div
                        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200"
                        role="progressbar"
                        aria-label={`${label} coverage`}
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${percent}%` }} />
                      </div>
                    )}
                    <p className="mt-2 text-sm text-slate-700">
                      {covered.length} covered{missing.length > 0 ? `, ${missing.length} missing` : ""}
                    </p>
                    {missing.length > 0 && (
                      <p className="mt-1 text-xs text-amber-700" aria-label={`Missing ${label} coverage`}>
                        Missing: {missing.join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {intelligence.duplicateQuestionsRemoved > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                {intelligence.duplicateQuestionsRemoved} near-duplicate question{intelligence.duplicateQuestionsRemoved === 1 ? "" : "s"} detected and excluded from the counts above.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700">Personalized Preparation Plan</h3>
            <div className="mt-4 space-y-5">
              {TIER_ORDER.map((tier) => {
                const items = intelligence.plan.filter((item) => item.tier === tier);
                if (items.length === 0) return null;

                return (
                  <div key={tier}>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500" aria-label={`${tier} interview topics`}>
                      {tier} ({items.length})
                    </h4>
                    <ul className="mt-2 space-y-2">
                      {items.map((item) => (
                        <li key={item.topic} className={`rounded-xl border p-3 text-sm ${TIER_CLASSNAME[item.tier]}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold">{item.topic}</span>
                            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase">{item.priority}</span>
                          </div>
                          <p className="mt-1 text-xs opacity-90">{item.reason}</p>
                          {item.question ? (
                            <p className="mt-2 text-xs italic">Question: &ldquo;{item.question.text}&rdquo;</p>
                          ) : item.recommendedPreparation.length > 0 ? (
                            <ul className="mt-2 list-disc pl-4 text-xs opacity-90">
                              {item.recommendedPreparation.map((point) => (
                                <li key={point}>{point}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-xs italic opacity-75">No dedicated question yet — no curated study reference available for this topic.</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          <PrepJdGapPanel gaps={intelligence.jdGaps} />
          <PrepResumeEvidencePanel evidence={intelligence.resumeEvidence} />
        </>
      )}
    </div>
  );
}

import type { AtsScore } from "@/lib/ai/resume/resume-schema";
import type { SectionType } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-schema";
import {
  classifyResumeHealth,
  classifyRecruiterReadiness,
  explainGeneralAtsCategories,
  deriveStrengthsFromCategories,
  deriveIssuesFromCategories,
  GENERAL_ATS_WEIGHTS,
} from "@/lib/ai/resume-versions/dynamic/ats-explainability";
import type { ResumeQualityReport } from "@/lib/ai/resume-versions/dynamic/resume-quality";

type Props = {
  score: AtsScore;
  /** Only available for a Resume Version (from the builder/design tab's existing quality check) — Recruiter Readiness degrades gracefully without it. */
  quality?: ResumeQualityReport | null;
  /** Phase 15 Milestone 8 (§15) — only available for a Resume Version (the ephemeral analyzer has no Builder to open). Omitted, "Open Builder" simply doesn't render for that issue. */
  onOpenSection?: (sectionType: SectionType) => void;
};

function verdict(overall: number): { label: string; className: string } {
  if (overall >= 85) return { label: "Excellent", className: "text-green-700 bg-green-50" };
  if (overall >= 70) return { label: "Good", className: "text-blue-700 bg-blue-50" };
  if (overall >= 50) return { label: "Fair", className: "text-amber-700 bg-amber-50" };

  return { label: "Needs work", className: "text-red-700 bg-red-50" };
}

const HEALTH_CLASSNAME: Record<string, string> = {
  Excellent: "text-green-700 bg-green-50",
  Strong: "text-blue-700 bg-blue-50",
  Good: "text-blue-700 bg-blue-50",
  "Needs Improvement": "text-amber-700 bg-amber-50",
  "High Risk": "text-red-700 bg-red-50",
};

const READINESS_CLASSNAME: Record<string, string> = {
  High: "text-green-700 bg-green-50",
  Medium: "text-amber-700 bg-amber-50",
  Low: "text-red-700 bg-red-50",
};

const PRIORITY_CLASSNAME: Record<string, string> = {
  Critical: "text-red-700 bg-red-50",
  High: "text-orange-700 bg-orange-50",
  Medium: "text-amber-700 bg-amber-50",
  Low: "text-slate-500 bg-slate-100",
};

export default function ResumeAtsScore({ score, quality = null, onOpenSection }: Props) {
  const badge = verdict(score.overall);
  const health = classifyResumeHealth(score.overall);
  const readiness = classifyRecruiterReadiness(score, quality);
  const categories = explainGeneralAtsCategories(score);
  const strengths = deriveStrengthsFromCategories(categories);
  const issues = deriveIssuesFromCategories(categories, GENERAL_ATS_WEIGHTS, 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">ATS Score</p>
          <p className="mt-1 text-4xl font-bold text-slate-900">{score.overall}/100</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-4 py-2 text-sm font-semibold ${badge.className}`}>{badge.label}</span>
        </div>
      </div>

      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={score.overall} aria-valuemin={0} aria-valuemax={100} aria-label="Overall ATS score">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${score.overall}%` }} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <div className={`rounded-xl px-3 py-2 text-xs font-semibold ${HEALTH_CLASSNAME[health]}`}>
          Resume Health: <span className="font-bold">{health}</span>
        </div>
        <div className={`rounded-xl px-3 py-2 text-xs font-semibold ${READINESS_CLASSNAME[readiness.level]}`} title={readiness.reasons.join(" ")}>
          Recruiter Readiness: <span className="font-bold">{readiness.level}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        {categories.map(({ key, label, value, explanation }) => (
          <div key={key}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-600">{label}</span>
              <span className="font-semibold text-slate-900">{value}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${value}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{explanation}</p>
          </div>
        ))}
      </div>

      {strengths.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-green-700">Your strongest areas</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {strengths.map((strength) => (
              <li key={strength}>• {strength}</li>
            ))}
          </ul>
        </div>
      )}

      {issues.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-red-700">What would help most</p>
          <ul className="mt-2 space-y-2">
            {issues.map((issue) => (
              <li key={issue.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <span className="text-slate-700">{issue.label}</span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_CLASSNAME[issue.priority]}`}>{issue.priority}</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{issue.fixType === "safe" ? "Safe Fix" : "Manual Confirmation"}</span>
                  {issue.potentialImpact > 0 && <span className="text-xs font-semibold text-blue-600">+{issue.potentialImpact} pts</span>}
                  {onOpenSection && issue.sectionType && (
                    <button
                      type="button"
                      onClick={() => onOpenSection(issue.sectionType!)}
                      aria-label={`Open ${issue.label} section in the Builder`}
                      className="rounded-lg border border-blue-300 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Open Builder
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-sm leading-6 text-slate-600">{score.explanation}</p>
    </div>
  );
}

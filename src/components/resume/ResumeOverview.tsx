import type { ResumeAnalysis } from "@/lib/ai/resume/resume-schema";

type Props = {
  analysis: ResumeAnalysis;
  candidateName: string | null;
};

const CAREER_LEVEL_LABELS: Record<string, string> = {
  "entry-level": "Entry-level",
  "mid-level": "Mid-level",
  senior: "Senior",
  lead: "Lead",
  principal: "Principal",
};

export default function ResumeOverview({ analysis, candidateName }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Analysis
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            {candidateName ?? "Candidate"} Overview
          </h2>
        </div>

        <span className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          {CAREER_LEVEL_LABELS[analysis.careerLevel] ?? analysis.careerLevel}
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">{analysis.professionalSummary}</p>

      {analysis.suitableRoles.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Suitable Roles
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {analysis.suitableRoles.map((role) => (
              <span
                key={role}
                className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700"
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Key Strengths
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
            {analysis.keyStrengths.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-green-600">+</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Weaknesses
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
            {analysis.weaknesses.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-red-500">-</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {analysis.improvementSuggestions.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Improvement Suggestions
          </p>
          <ul className="mt-2 space-y-2">
            {analysis.improvementSuggestions.map((item) => (
              <li
                key={item}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

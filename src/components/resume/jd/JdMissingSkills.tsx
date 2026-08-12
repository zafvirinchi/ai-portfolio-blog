import type { JdMatchResult, JobDescription } from "@/lib/ai/job-description/jd-schema";
import { classifyMissingKeyword } from "@/lib/ai/resume-versions/dynamic/ats-explainability";

type Props = {
  result: JdMatchResult;
  /** Only available in the JD-match flow (the full parsed job description) — importance/placement degrade to a flat list without it, never guessed. */
  jobDescription?: JobDescription;
};

const IMPORTANCE_CLASSNAME: Record<string, string> = {
  Critical: "bg-red-50 text-red-700",
  High: "bg-orange-50 text-orange-700",
  Medium: "bg-amber-50 text-amber-700",
};

export default function JdMissingSkills({ result, jobDescription }: Props) {
  const insights = jobDescription ? result.missingKeywordsSection.map((skill) => classifyMissingKeyword(skill, jobDescription)) : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
        Skills to add or highlight
      </p>

      {result.missingKeywordsSection.length === 0 ? (
        <p className="text-sm text-slate-400">No missing skills identified.</p>
      ) : insights ? (
        <div className="space-y-2">
          {insights.map((insight) => (
            <div key={insight.keyword} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-sm font-medium text-slate-800">{insight.keyword}</span>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${IMPORTANCE_CLASSNAME[insight.importance]}`}>{insight.importance}</span>
                <span className="text-xs text-slate-500">{insight.whereItBelongs}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {result.missingKeywordsSection.map((skill) => (
            <span key={skill} className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
              {skill}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

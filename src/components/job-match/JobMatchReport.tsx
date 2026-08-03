import type { JobMatchAnalysis } from "@/lib/ai/job-match/job-match-schema";

type Props = {
  jobMatch: JobMatchAnalysis;
};

export default function JobMatchReport({ jobMatch }: Props) {
  return (
    <div className="space-y-6">
      {jobMatch.experienceGaps.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Experience Gap
          </p>
          <div className="mt-4 space-y-3">
            {jobMatch.experienceGaps.map((gap) => (
              <div
                key={gap.area}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <span className="text-sm font-semibold text-slate-900">{gap.area}</span>
                <div className="text-right text-sm">
                  <p className="text-slate-600">{gap.required}</p>
                  <p className="font-medium text-amber-700">{gap.candidateHas}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {jobMatch.resumeSectionAnalysis.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Resume Section Analysis
          </p>
          <div className="mt-4 space-y-3">
            {jobMatch.resumeSectionAnalysis.map((section) => (
              <div key={section.section}>
                <p className="text-sm font-semibold text-slate-900">{section.section}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{section.feedback}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Recruiter Feedback
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-600">{jobMatch.recruiterFeedback}</p>
      </div>

      {jobMatch.priorityImprovements.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Priority Improvements
          </p>
          <ul className="mt-3 space-y-2">
            {jobMatch.priorityImprovements.map((item) => (
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

      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">
          Final Recommendation
        </p>
        <p className="mt-3 text-lg font-semibold text-slate-900">{jobMatch.finalRecommendation}</p>
      </div>
    </div>
  );
}

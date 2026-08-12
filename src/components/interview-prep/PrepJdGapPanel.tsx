import type { JdGapItem, PriorityLevel } from "@/lib/ai/interview-prep/interview-coverage";

type Props = {
  gaps: JdGapItem[];
};

// Phase 17 Milestone 4, §5 — a focused view over the JD's own required/
// preferred skills, each showing whether it's genuinely missing from the
// resume and/or from generated interview coverage. Every value here
// comes from interview-coverage.ts's buildJdGapAnalysis() (deterministic,
// zero LLM) — this component only renders it; it never claims a skill is
// present unless missingFromResume is explicitly false.

const PRIORITY_CLASSNAME: Record<PriorityLevel, string> = {
  CRITICAL: "border-red-200 bg-red-50 text-red-800",
  HIGH: "border-orange-200 bg-orange-50 text-orange-800",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-800",
  LOW: "border-slate-200 bg-slate-50 text-slate-600",
};

export default function PrepJdGapPanel({ gaps }: Props) {
  if (gaps.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-bold text-slate-700">JD Preparation Gaps</h3>
      <p className="mt-1 text-xs text-slate-500">Every job-description requirement, and whether it&apos;s covered by your resume and by your interview preparation.</p>

      <ul className="mt-4 space-y-2">
        {gaps.map((gap) => (
          <li key={gap.skill} className={`rounded-xl border p-3 text-sm ${PRIORITY_CLASSNAME[gap.priority]}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{gap.skill}</span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase">{gap.priority}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <span aria-label={`${gap.skill} resume status`}>
                Resume: <span className="font-semibold">{gap.missingFromResume ? "Missing" : "Present"}</span>
              </span>
              <span aria-label={`${gap.skill} interview coverage status`}>
                Interview Coverage: <span className="font-semibold">{gap.missingFromCoverage ? "Missing" : "Covered"}</span>
              </span>
            </div>
            {gap.recommendedPreparation.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold uppercase opacity-75">Recommended preparation</p>
                <ul className="mt-1 list-disc pl-4 text-xs opacity-90">
                  {gap.recommendedPreparation.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

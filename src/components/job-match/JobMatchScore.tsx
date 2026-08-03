import type { AtsScore } from "@/lib/ai/resume/resume-schema";
import type { JobMatchSubScores } from "@/lib/ai/job-match/job-match-schema";

type Props = {
  jdMatchPercent: number;
  subScores: JobMatchSubScores;
  atsScore: AtsScore;
};

function verdict(percent: number): { label: string; className: string } {
  if (percent >= 85) return { label: "Excellent match", className: "text-green-700 bg-green-50" };
  if (percent >= 70) return { label: "Good match", className: "text-blue-700 bg-blue-50" };
  if (percent >= 50) return { label: "Fair match", className: "text-amber-700 bg-amber-50" };

  return { label: "Needs work", className: "text-red-700 bg-red-50" };
}

export default function JobMatchScore({ jdMatchPercent, subScores, atsScore }: Props) {
  const badge = verdict(jdMatchPercent);

  const grid: { label: string; value: number }[] = [
    { label: "ATS Score", value: atsScore.overall },
    { label: "Technical Match", value: subScores.technicalMatchPercent },
    { label: "Experience Match", value: subScores.experienceMatchPercent },
    { label: "Education Match", value: subScores.educationMatchPercent },
    { label: "Soft Skills", value: subScores.softSkillsMatchPercent },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">JD Match</p>
          <p className="mt-1 text-5xl font-bold text-slate-900">{jdMatchPercent}%</p>
        </div>

        <span className={`rounded-full px-4 py-2 text-sm font-semibold ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${jdMatchPercent}%` }}
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
        {grid.map(({ label, value }) => (
          <div key={label}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-600">{label}</span>
              <span className="font-semibold text-slate-900">{value}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

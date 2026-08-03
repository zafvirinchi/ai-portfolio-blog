import type { AtsScore } from "@/lib/ai/resume/resume-schema";

type Props = {
  jdMatchPercent: number;
  atsScore: AtsScore;
};

function verdict(percent: number): { label: string; className: string } {
  if (percent >= 85) return { label: "Excellent match", className: "text-green-700 bg-green-50" };
  if (percent >= 70) return { label: "Good match", className: "text-blue-700 bg-blue-50" };
  if (percent >= 50) return { label: "Fair match", className: "text-amber-700 bg-amber-50" };

  return { label: "Needs work", className: "text-red-700 bg-red-50" };
}

export default function JobMatchScore({ jdMatchPercent, atsScore }: Props) {
  const badge = verdict(jdMatchPercent);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Resume Match
          </p>
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

      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            ATS Score
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">{atsScore.overall}/100</p>
        </div>

        <p className="max-w-xs text-right text-xs text-slate-500">General resume quality, independent of this specific job.</p>
      </div>
    </div>
  );
}

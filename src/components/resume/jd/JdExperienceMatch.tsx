import type { JdMatchResult } from "@/lib/ai/job-description/jd-schema";

type Props = {
  result: JdMatchResult;
};

function levelBadgeClass(level: string): string {
  if (level === "Excellent") return "bg-green-50 text-green-700";
  if (level === "Good") return "bg-blue-50 text-blue-700";

  return "bg-amber-50 text-amber-700";
}

export default function JdExperienceMatch({ result }: Props) {
  const { experienceMatch } = result;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Experience Match</p>
        <span className={`rounded-full px-4 py-2 text-sm font-semibold ${levelBadgeClass(experienceMatch.level)}`}>
          {experienceMatch.level}
        </span>
      </div>

      <p className="mt-2 text-3xl font-bold text-slate-900">{experienceMatch.score}/100</p>

      <p className="mt-4 text-sm leading-6 text-slate-600">{experienceMatch.reasoning}</p>
    </div>
  );
}

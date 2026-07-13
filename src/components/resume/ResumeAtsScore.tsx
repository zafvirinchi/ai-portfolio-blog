import type { AtsScore } from "@/lib/ai/resume/resume-schema";

type Props = {
  score: AtsScore;
};

const SUB_SCORES: { key: keyof Omit<AtsScore, "overall" | "explanation">; label: string }[] = [
  { key: "formatting", label: "Formatting" },
  { key: "keyword", label: "Keyword" },
  { key: "experience", label: "Experience" },
  { key: "skills", label: "Skills" },
  { key: "education", label: "Education" },
  { key: "certification", label: "Certification" },
];

function verdict(overall: number): { label: string; className: string } {
  if (overall >= 85) return { label: "Excellent", className: "text-green-700 bg-green-50" };
  if (overall >= 70) return { label: "Good", className: "text-blue-700 bg-blue-50" };
  if (overall >= 50) return { label: "Fair", className: "text-amber-700 bg-amber-50" };

  return { label: "Needs work", className: "text-red-700 bg-red-50" };
}

export default function ResumeAtsScore({ score }: Props) {
  const badge = verdict(score.overall);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            ATS Score
          </p>
          <p className="mt-1 text-4xl font-bold text-slate-900">{score.overall}/100</p>
        </div>

        <span className={`rounded-full px-4 py-2 text-sm font-semibold ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Overall meter — same-ramp track, single hue fill proportional to the score. */}
      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${score.overall}%` }}
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {SUB_SCORES.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-600">{label}</span>
              <span className="font-semibold text-slate-900">{score[key]}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${score[key]}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm leading-6 text-slate-600">{score.explanation}</p>
    </div>
  );
}

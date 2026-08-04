import type { JdMatchResult } from "@/lib/ai/job-description/jd-schema";

type Props = {
  result: JdMatchResult;
};

const CATEGORIES: { key: keyof JdMatchResult; label: string }[] = [
  { key: "keywordScore", label: "Keyword" },
  { key: "experienceScore", label: "Experience" },
  { key: "educationScore", label: "Education" },
  { key: "formattingScore", label: "Formatting" },
  { key: "achievementScore", label: "Achievement" },
  { key: "projectScore", label: "Project" },
  { key: "leadershipScore", label: "Leadership" },
  { key: "certificationScore", label: "Certifications" },
  { key: "aiScore", label: "AI Skills" },
  { key: "cloudScore", label: "Cloud" },
  { key: "securityScore", label: "Security" },
  { key: "softSkillsScore", label: "Soft Skills" },
];

function verdict(overall: number): { label: string; className: string } {
  if (overall >= 85) return { label: "Excellent", className: "text-green-700 bg-green-50" };
  if (overall >= 70) return { label: "Good", className: "text-blue-700 bg-blue-50" };
  if (overall >= 50) return { label: "Fair", className: "text-amber-700 bg-amber-50" };

  return { label: "Needs work", className: "text-red-700 bg-red-50" };
}

export default function JdAtsBreakdown({ result }: Props) {
  const badge = verdict(result.atsScore);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">JD-Aware ATS Score</p>
          <p className="mt-1 text-4xl font-bold text-slate-900">{result.atsScore}/100</p>
        </div>

        <span className={`rounded-full px-4 py-2 text-sm font-semibold ${badge.className}`}>{badge.label}</span>
      </div>

      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${result.atsScore}%` }} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {CATEGORIES.map(({ key, label }) => {
          const value = result[key] as number;

          return (
            <div key={key}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600">{label}</span>
                <span className="font-semibold text-slate-900">{value}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${value}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {(result.resumeStrengths.length > 0 || result.resumeWeaknesses.length > 0) && (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {result.resumeStrengths.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-green-700">Strengths</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {result.resumeStrengths.map((strength) => (
                  <li key={strength}>• {strength}</li>
                ))}
              </ul>
            </div>
          )}

          {result.resumeWeaknesses.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-red-700">Weaknesses</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {result.resumeWeaknesses.map((weakness) => (
                  <li key={weakness}>• {weakness}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

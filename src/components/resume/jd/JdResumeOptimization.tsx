import type { JdMatchResult } from "@/lib/ai/job-description/jd-schema";

type Props = {
  result: JdMatchResult;
  jdMatchId: string;
};

function priorityBadgeClass(priority: string): string {
  if (priority === "High") return "bg-red-50 text-red-700";
  if (priority === "Medium") return "bg-amber-50 text-amber-700";

  return "bg-slate-100 text-slate-600";
}

function BulletComparison({ bullets, emptyLabel }: { bullets: JdMatchResult["optimizedExperience"]; emptyLabel: string }) {
  if (bullets.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-4">
      {bullets.map((bullet, index) => (
        <div key={index} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-400">Original</p>
          <p className="mt-1 text-sm text-slate-500 line-through decoration-slate-300">{bullet.original}</p>

          <p className="mt-3 text-xs font-semibold text-blue-500">
            Optimized{bullet.starFormat ? " (STAR format)" : ""}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-800">{bullet.optimized}</p>
        </div>
      ))}
    </div>
  );
}

export default function JdResumeOptimization({ result, jdMatchId }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">Download your optimized resume</p>

        <div className="flex gap-2">
          {(["markdown", "pdf", "docx"] as const).map((format) => (
            <a
              key={format}
              href={`/api/ai/resume/jd-match/${jdMatchId}/export?format=${format}`}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {format === "markdown" ? "Markdown" : format.toUpperCase()}
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Optimized Professional Summary
        </p>
        <p className="mt-3 text-sm leading-7 text-slate-700">{result.optimizedSummary}</p>
      </div>

      {result.optimizedSkills.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Optimized Skills</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.optimizedSkills.map((skill) => (
              <span key={skill} className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Optimized Experience Bullets</p>
        <div className="mt-4">
          <BulletComparison bullets={result.optimizedExperience} emptyLabel="No experience bullets were rewritten." />
        </div>
      </div>

      {result.optimizedProjects.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Optimized Project Bullets</p>
          <div className="mt-4">
            <BulletComparison bullets={result.optimizedProjects} emptyLabel="No project bullets were rewritten." />
          </div>
        </div>
      )}

      {result.improvementSuggestions.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Top Improvement Suggestions</p>
          <div className="mt-4 space-y-4">
            {result.improvementSuggestions.map((suggestion, index) => (
              <div key={index} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">{suggestion.title}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityBadgeClass(suggestion.priority)}`}>
                    {suggestion.priority}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-semibold">Why: </span>
                  {suggestion.why}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-semibold">Impact: </span>
                  {suggestion.impact}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-semibold">How to fix: </span>
                  {suggestion.howToFix}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

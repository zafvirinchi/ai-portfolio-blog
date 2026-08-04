import type { JdMatchResult } from "@/lib/ai/job-description/jd-schema";

type Props = {
  result: JdMatchResult;
};

export default function JdMissingSkills({ result }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
        Skills to add or highlight
      </p>

      {result.missingKeywordsSection.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {result.missingKeywordsSection.map((skill) => (
            <span key={skill} className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
              {skill}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No missing skills identified.</p>
      )}
    </div>
  );
}

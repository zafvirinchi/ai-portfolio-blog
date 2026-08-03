import type { JobMatchAnalysis } from "@/lib/ai/job-match/job-match-schema";

type Props = {
  jobMatch: JobMatchAnalysis;
};

function ChipSection({
  title,
  items,
  chipClassName,
}: {
  title: string;
  items: string[];
  chipClassName: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className={`rounded-full px-3 py-1 text-xs font-medium ${chipClassName}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function JobMatchGapAnalysis({ jobMatch }: Props) {
  const hasAnyGap =
    jobMatch.missingSkills.length > 0 ||
    jobMatch.missingKeywords.length > 0 ||
    jobMatch.softSkillGaps.length > 0 ||
    jobMatch.certificationGaps.length > 0 ||
    jobMatch.projectGaps.length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Gap Analysis</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">Where this resume falls short</h2>

      {!hasAnyGap ? (
        <p className="mt-4 text-sm text-slate-600">
          No significant gaps detected against this job description — strong alignment.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <ChipSection
            title="Critical Missing Skills"
            items={jobMatch.missingSkills}
            chipClassName="bg-red-50 text-red-700"
          />
          <ChipSection
            title="Missing Keywords"
            items={jobMatch.missingKeywords}
            chipClassName="bg-amber-50 text-amber-700"
          />
          <ChipSection
            title="Soft Skill Gaps"
            items={jobMatch.softSkillGaps}
            chipClassName="bg-purple-50 text-purple-700"
          />
          <ChipSection
            title="Certification Gaps"
            items={jobMatch.certificationGaps}
            chipClassName="bg-blue-50 text-blue-700"
          />
          <ChipSection
            title="Project Experience Gaps"
            items={jobMatch.projectGaps}
            chipClassName="bg-slate-100 text-slate-700"
          />
        </div>
      )}
    </div>
  );
}

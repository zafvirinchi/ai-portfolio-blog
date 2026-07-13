import type { SkillGap } from "@/lib/ai/resume/resume-schema";

type Props = {
  skillGap: SkillGap;
};

const CATEGORIES: { key: keyof SkillGap & `missing${string}`; label: string }[] = [
  { key: "missingJavaSkills", label: "Java" },
  { key: "missingSpringSkills", label: "Spring" },
  { key: "missingCloudSkills", label: "Cloud" },
  { key: "missingDevOpsSkills", label: "DevOps" },
  { key: "missingAiSkills", label: "AI" },
  { key: "missingDatabaseSkills", label: "Database" },
];

function RecommendationList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ResumeSkillGap({ skillGap }: Props) {
  const categoriesWithGaps = CATEGORIES.filter((category) => skillGap[category.key].length > 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Skill Gap</p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">Where to focus next</h2>

      {categoriesWithGaps.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          No significant gaps detected against our reference skill list — nice coverage.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {categoriesWithGaps.map((category) => (
            <div key={category.key} className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">{category.label}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {skillGap[category.key].map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(skillGap.recommendedCourses.length > 0 ||
        skillGap.recommendedCertifications.length > 0 ||
        skillGap.recommendedProjects.length > 0) && (
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <RecommendationList title="Recommended courses" items={skillGap.recommendedCourses} />
          <RecommendationList
            title="Recommended certifications"
            items={skillGap.recommendedCertifications}
          />
          <RecommendationList title="Recommended projects" items={skillGap.recommendedProjects} />
        </div>
      )}
    </div>
  );
}

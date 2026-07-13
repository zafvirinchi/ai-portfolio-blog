type Props = {
  technologyStack: string[];
};

// A resume's tech stack has no real per-skill magnitude to plot (no
// proficiency score exists in the source data), so this renders as
// honestly-categorized chips rather than a fabricated radar/spider plot —
// see PHASE9 docs for the reasoning. All chips share one accent color
// (they're one series — "detected technology" — not competing categories),
// only the group labels differentiate.
const CATEGORY_KEYWORDS: { label: string; keywords: string[] }[] = [
  { label: "Languages", keywords: ["java", "python", "javascript", "typescript", "c#", "c++", "go", "kotlin", "sql"] },
  { label: "Frameworks", keywords: ["spring", "react", "angular", "next.js", "node", "express", "django", "flask", ".net"] },
  { label: "Cloud & Infra", keywords: ["aws", "azure", "gcp", "docker", "kubernetes", "terraform", "cloudformation"] },
  { label: "Databases", keywords: ["postgres", "mysql", "mongodb", "redis", "oracle", "dynamodb", "sql server"] },
  { label: "DevOps & Tools", keywords: ["jenkins", "github actions", "gitlab", "ci/cd", "git", "maven", "gradle"] },
  { label: "AI & Data", keywords: ["langchain", "langgraph", "openai", "machine learning", "tensorflow", "pytorch", "nlp"] },
];

function categorize(tech: string): string {
  const lower = tech.toLowerCase();

  for (const category of CATEGORY_KEYWORDS) {
    if (category.keywords.some((keyword) => lower.includes(keyword))) {
      return category.label;
    }
  }

  return "Other";
}

export default function ResumeTechRadar({ technologyStack }: Props) {
  if (technologyStack.length === 0) {
    return null;
  }

  const groups = new Map<string, string[]>();

  for (const tech of technologyStack) {
    const category = categorize(tech);
    groups.set(category, [...(groups.get(category) ?? []), tech]);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        Technology Radar
      </p>
      <h2 className="mt-1 text-xl font-bold text-slate-900">Detected technology stack</h2>

      <div className="mt-5 space-y-4">
        {Array.from(groups.entries()).map(([label, techs]) => (
          <div key={label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {techs.map((tech) => (
                <span
                  key={tech}
                  className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

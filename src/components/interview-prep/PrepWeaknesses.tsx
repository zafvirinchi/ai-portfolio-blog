import type { InterviewPreparationReport } from "@/lib/ai/interview-prep/prep-schema";

type Props = {
  report: InterviewPreparationReport;
};

function ListBlock({ title, items, toneClassName }: { title: string; items: string[]; toneClassName: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      {items.length > 0 ? (
        <ul className={`space-y-1 text-sm ${toneClassName}`}>
          {items.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">None identified</p>
      )}
    </div>
  );
}

export default function PrepWeaknesses({ report }: Props) {
  const { weaknessAnalysis, confidenceAnalysis } = report;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <ListBlock title="Weak Areas" items={weaknessAnalysis.weakAreas} toneClassName="text-red-600" />
        <ListBlock title="Missing Skills" items={weaknessAnalysis.missingSkills} toneClassName="text-red-600" />
        <ListBlock title="Knowledge Gaps" items={weaknessAnalysis.knowledgeGaps} toneClassName="text-amber-600" />
        <ListBlock title="Concepts to Learn First" items={weaknessAnalysis.conceptsToLearn} toneClassName="text-amber-600" />
        <ListBlock title="Projects to Build" items={weaknessAnalysis.projectsToBuild} toneClassName="text-slate-700" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <ListBlock title="Strong Areas" items={confidenceAnalysis.strongAreas} toneClassName="text-green-700" />
        <ListBlock title="High Confidence Topics" items={confidenceAnalysis.highConfidenceTopics} toneClassName="text-green-700" />
      </div>
    </div>
  );
}

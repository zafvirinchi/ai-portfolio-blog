import type { InterviewPreparationReport } from "@/lib/ai/interview-prep/prep-schema";

type Props = {
  report: InterviewPreparationReport;
};

export default function PrepLearningRoadmap({ report }: Props) {
  return (
    <div className="space-y-6">
      {report.learningRoadmap.map((plan) => {
        const blocks = [
          { label: "Topics", items: plan.topics },
          { label: "Projects", items: plan.projects },
          { label: "Courses", items: plan.courses },
          { label: "Documentation", items: plan.documentation },
        ].filter((block) => block.items.length > 0);

        return (
          <div key={plan.days} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">{plan.days}-Day Plan</p>
            <p className="mt-1 text-sm text-slate-600">{plan.focus.join(", ")}</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {blocks.map((block) => (
                <div key={block.label}>
                  <p className="mb-1 text-sm font-semibold text-slate-700">{block.label}</p>
                  <ul className="space-y-1 text-sm text-slate-600">
                    {block.items.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {plan.interviewPracticeNotes.length > 0 && (
              <div className="mt-4 space-y-1 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                {plan.interviewPracticeNotes.map((note) => (
                  <p key={note}>• {note}</p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

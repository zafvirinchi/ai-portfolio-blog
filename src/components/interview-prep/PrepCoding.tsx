import type { InterviewPreparationReport } from "@/lib/ai/interview-prep/prep-schema";

type Props = {
  report: InterviewPreparationReport;
};

export default function PrepCoding({ report }: Props) {
  if (report.codingRecommendations.length === 0) {
    return <p className="text-sm text-slate-400">No coding recommendations.</p>;
  }

  return (
    <div className="space-y-3">
      {report.codingRecommendations.map((item, index) => (
        <div key={index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-slate-900">{item.topic}</p>
            <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {item.difficulty}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{item.practiceNote}</p>
          <p className="mt-1 text-xs text-slate-400">Platforms: {item.platforms.join(", ")}</p>
        </div>
      ))}
    </div>
  );
}

import type { InterviewPreparationReport } from "@/lib/ai/interview-prep/prep-schema";

type Props = {
  report: InterviewPreparationReport;
};

export default function PrepCheatSheet({ report }: Props) {
  if (report.cheatSheet.length === 0) {
    return <p className="text-sm text-slate-400">No cheat sheet entries.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {report.cheatSheet.map((entry) => (
        <div key={entry.technology} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="font-semibold text-slate-900">{entry.technology}</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {entry.points.map((point) => (
              <li key={point}>• {point}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

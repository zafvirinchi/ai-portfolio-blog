import type { ImportResult } from "@/lib/ai/interview-import/import-types";

const REASON_LABELS: Record<string, string> = {
  "duplicate-question": "Duplicate question",
  "invalid-record": "Invalid record",
};

type Props = {
  result: ImportResult;
  filename: string;
};

export default function InterviewFinalSummary({ result, filename }: Props) {
  const stats = [
    { label: "Categories Created", value: result.createdCategories },
    { label: "Topics Created", value: result.createdTopics },
    { label: "Questions Imported", value: result.importedQuestions },
    { label: "Duplicates Skipped", value: result.skippedQuestions },
    { label: "Processing Time", value: `${(result.processingTimeMs / 1000).toFixed(2)}s` },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm">
        <p className="text-sm text-green-700">Imported</p>
        <p className="font-semibold text-slate-900">{filename}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Reused (not recreated)</p>
        <p className="mt-1 text-sm text-slate-600">
          {result.existingCategories} existing categor{result.existingCategories === 1 ? "y" : "ies"} and{" "}
          {result.existingTopics} existing topic{result.existingTopics === 1 ? "" : "s"} were reused instead of
          being duplicated.
        </p>
      </div>

      {result.duplicates.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Skipped / Duplicate Records</p>

          <ul className="mt-3 space-y-2">
            {result.duplicates.map((duplicate, index) => (
              <li
                key={`${duplicate.question}-${index}`}
                className="flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-900">{duplicate.question || "(empty question)"}</p>
                  <p className="text-xs text-slate-500">
                    {duplicate.category} &rsaquo; {duplicate.topic}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                  {REASON_LABELS[duplicate.reason] ?? duplicate.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

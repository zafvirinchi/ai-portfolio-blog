import type { InterviewImportApiResult } from "./InterviewImportUpload";

type Props = {
  result: InterviewImportApiResult;
};

const REASON_LABELS: Record<string, string> = {
  "duplicate-question": "Duplicate question",
  "invalid-record": "Invalid record",
};

export default function InterviewImportSummary({ result }: Props) {
  const { extraction, import: importResult } = result;

  const stats = [
    { label: "Categories Created", value: importResult.createdCategories },
    { label: "Topics Created", value: importResult.createdTopics },
    { label: "Questions Imported", value: importResult.importedQuestions },
    { label: "Duplicates Skipped", value: importResult.skippedQuestions },
    { label: "Processing Time", value: `${(importResult.processingTimeMs / 1000).toFixed(2)}s` },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">Imported file</p>
        <p className="font-semibold text-slate-900">{extraction.filename}</p>
        <p className="mt-1 text-xs text-slate-500">
          {extraction.metadata.questionCount} question{extraction.metadata.questionCount === 1 ? "" : "s"} extracted
          &middot; {extraction.metadata.categoryCount} categor{extraction.metadata.categoryCount === 1 ? "y" : "ies"}
          &middot; {extraction.metadata.topicCount} topic{extraction.metadata.topicCount === 1 ? "" : "s"}
        </p>
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
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Reused (not recreated)
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {importResult.existingCategories} existing categor{importResult.existingCategories === 1 ? "y" : "ies"} and{" "}
          {importResult.existingTopics} existing topic{importResult.existingTopics === 1 ? "" : "s"} were reused
          instead of being duplicated.
        </p>
      </div>

      {importResult.duplicates.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Skipped / Duplicate Records
          </p>

          <ul className="mt-3 space-y-2">
            {importResult.duplicates.map((duplicate, index) => (
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

      {extraction.errors.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Extraction notices</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {extraction.errors.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

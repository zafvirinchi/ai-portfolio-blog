import type { SessionRecord } from "@/lib/ai/mock-interview/session-types";

type Props = {
  session: SessionRecord;
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

export default function MockInterviewReport({ session }: Props) {
  const { report } = session;

  if (!report) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
        End the interview from the Interview tab to generate your full report.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">
          Overall: <span className="text-blue-600">{report.overallScore}/100</span> · Readiness:{" "}
          <span className="text-blue-600">{report.interviewReadiness}/100</span>
        </p>
        <div className="flex gap-2">
          {(["markdown", "pdf", "docx"] as const).map((format) => (
            <a
              key={format}
              href={`/api/ai/mock-interview/${session.sessionId}/export?format=${format}`}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {format === "markdown" ? "Markdown" : format.toUpperCase()}
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <ListBlock title="Strengths" items={report.strengths} toneClassName="text-green-700" />
        <ListBlock title="Weaknesses" items={report.weaknesses} toneClassName="text-red-600" />
        <ListBlock title="Top Improvements" items={report.topImprovements} toneClassName="text-amber-600" />
        <ListBlock title="Questions Missed" items={report.questionsMissed} toneClassName="text-slate-700" />
      </div>

      {report.learningRoadmap.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Learning Roadmap</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {report.learningRoadmap.map((plan) => (
              <div key={plan.days} className="rounded-xl border border-slate-200 p-4">
                <p className="font-semibold text-slate-900">{plan.days}-Day Plan</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {plan.topics.map((topic) => (
                    <li key={topic}>• {topic}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

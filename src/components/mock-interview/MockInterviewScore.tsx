import type { SessionRecord } from "@/lib/ai/mock-interview/session-types";

type Props = {
  session: SessionRecord;
};

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical",
  communication: "Communication",
  problemSolving: "Problem Solving",
  architecture: "Architecture",
  leadership: "Leadership",
  confidence: "Confidence",
  coding: "Coding",
  behavioral: "Behavioral",
};

export default function MockInterviewScore({ session }: Props) {
  const { report } = session;

  if (!report) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
        End the interview from the Interview tab to see your full score breakdown.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Overall Score</p>
          <p className="mt-1 text-4xl font-bold text-slate-900">{report.overallScore}/100</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Interview Readiness</p>
          <p className="mt-1 text-4xl font-bold text-blue-600">{report.interviewReadiness}/100</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Category Scores</p>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {Object.entries(report.categoryScores).map(([key, score]) => (
            <div key={key}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600">{CATEGORY_LABELS[key] ?? key}</span>
                <span className="font-semibold text-slate-900">{score}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${score}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {report.topicScores.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Topic-wise Score</p>
          <div className="space-y-3">
            {report.topicScores.map((topic) => (
              <div key={topic.topic}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-600">{topic.topic}</span>
                  <span className="font-semibold text-slate-900">{topic.score}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${topic.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import type { SessionRecord } from "@/lib/ai/mock-interview/session-types";

type Props = {
  session: SessionRecord;
};

export default function MockInterviewHistory({ session }: Props) {
  if (session.transcript.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
        No questions answered yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {session.transcript.map((turn, index) => (
        <div key={`${turn.question.id}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-slate-900">
              {turn.isFollowUp && (
                <span className="mr-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">Follow-up</span>
              )}
              {turn.question.text}
            </p>
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {turn.evaluation.overallScore}/100
            </span>
          </div>

          <p className="mt-2 text-xs uppercase tracking-widest text-slate-400">
            {turn.question.type} · {turn.question.difficulty} · {turn.question.topic}
          </p>

          <p className="mt-3 text-sm text-slate-600">{turn.answerText}</p>
        </div>
      ))}

      {session.questionsMissedText.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Skipped Questions</p>
          <ul className="space-y-1 text-sm text-slate-500">
            {session.questionsMissedText.map((text) => (
              <li key={text}>• {text}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

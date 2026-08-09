import type { LiveFeedback } from "@/lib/ai/mock-interview/feedback-agent";

type Props = {
  feedback: LiveFeedback | null;
};

function ListBlock({ title, items, toneClassName }: { title: string; items: string[]; toneClassName: string }) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      <ul className={`space-y-1 text-sm ${toneClassName}`}>
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function MockInterviewLiveFeedback({ feedback }: Props) {
  if (!feedback) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
        Submit an answer in the Interview tab to see feedback here.
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Score</p>
        <p className="mt-1 text-3xl font-bold text-slate-900">{feedback.score}/100</p>
        <p className="mt-1 text-sm text-slate-600">{feedback.headline}</p>
      </div>

      <ListBlock title="Strengths" items={feedback.strengths} toneClassName="text-green-700" />
      <ListBlock title="Weaknesses" items={feedback.weaknesses} toneClassName="text-red-600" />
      <ListBlock title="Missing Concepts" items={feedback.missingConcepts} toneClassName="text-amber-600" />
      <ListBlock title="Improvement Tips" items={feedback.improvementTips} toneClassName="text-slate-700" />

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">A Stronger Answer</p>
        <p className="text-sm text-slate-700">{feedback.betterAnswer}</p>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">Ideal Answer</p>
        <p className="text-sm text-slate-700">{feedback.idealAnswer}</p>
      </div>

      {feedback.followUp && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">Follow-up asked: {feedback.followUp}</div>
      )}
    </div>
  );
}

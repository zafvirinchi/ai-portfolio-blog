"use client";

import { FormEvent, useState } from "react";

import type { SessionRecord } from "@/lib/ai/mock-interview/session-types";

type Props = {
  session: SessionRecord;
  prompt: string | null;
  loading: boolean;
  error: string | null;
  onSubmitAnswer: (answerText: string) => void;
};

export default function MockInterviewQuestionPanel({ session, prompt, loading, error, onSubmitAnswer }: Props) {
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  const currentQuestion = session.pendingFollowUp ?? session.questions[session.currentIndex];
  const disabled = session.status !== "in_progress" || !currentQuestion;

  async function handleHint() {
    setHintLoading(true);

    try {
      const response = await fetch(`/api/ai/mock-interview/${session.sessionId}/hint`, { method: "POST" });
      const data = await response.json();

      setHint(response.ok ? data.hint : data.error || "Failed to get a hint.");
    } catch {
      setHint("Failed to get a hint.");
    } finally {
      setHintLoading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim()) return;

    onSubmitAnswer(answer.trim());
    setAnswer("");
    setHint(null);
  }

  if (session.status === "completed") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
        This interview has ended — check the Score and Report tabs for your results.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="rounded-xl bg-slate-950 p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Interviewer</p>
        <p className="mt-2 whitespace-pre-line leading-7">{prompt ?? currentQuestion?.text ?? "Session paused."}</p>
        {currentQuestion && (
          <p className="mt-3 text-xs text-slate-400">
            {currentQuestion.type} · {currentQuestion.difficulty} · {currentQuestion.topic}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={disabled || loading}
          rows={6}
          placeholder="Type your answer..."
          className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 disabled:bg-slate-50"
        />

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={disabled || loading || !answer.trim()}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit Answer"}
          </button>

          {session.mode === "practice" && (
            <button
              type="button"
              onClick={handleHint}
              disabled={disabled || hintLoading}
              className="rounded-xl border border-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {hintLoading ? "Thinking..." : "Get a Hint"}
            </button>
          )}
        </div>
      </form>

      {hint && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">💡 {hint}</div>}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    </div>
  );
}

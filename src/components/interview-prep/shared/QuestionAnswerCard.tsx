"use client";

import { useState } from "react";

import type { StarAnswer, TechnicalAnswer } from "@/lib/ai/interview-prep/prep-schema";

type Props = {
  question: string;
  badge?: string;
  answer: TechnicalAnswer | StarAnswer | string;
};

function isTechnicalAnswer(answer: TechnicalAnswer | StarAnswer): answer is TechnicalAnswer {
  return "architecture" in answer;
}

export default function QuestionAnswerCard({ question, badge, answer }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-slate-900">{question}</p>
        {badge && (
          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{badge}</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-800"
      >
        {expanded ? "Hide ideal answer" : "Explain the ideal answer"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {typeof answer === "string" ? (
            <p>{answer}</p>
          ) : isTechnicalAnswer(answer) ? (
            <>
              <p>
                <span className="font-semibold">Architecture:</span> {answer.architecture}
              </p>
              <p>
                <span className="font-semibold">Trade-offs:</span> {answer.tradeoffs}
              </p>
              <p>
                <span className="font-semibold">Best Practices:</span> {answer.bestPractices}
              </p>
              <p>
                <span className="font-semibold">Performance:</span> {answer.performance}
              </p>
              <p>
                <span className="font-semibold">Security:</span> {answer.security}
              </p>
            </>
          ) : (
            <>
              <p>
                <span className="font-semibold">Situation:</span> {answer.situation}
              </p>
              <p>
                <span className="font-semibold">Task:</span> {answer.task}
              </p>
              <p>
                <span className="font-semibold">Action:</span> {answer.action}
              </p>
              <p>
                <span className="font-semibold">Result:</span> {answer.result}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

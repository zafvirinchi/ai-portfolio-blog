"use client";

import { REWRITE_STYLES } from "@/lib/ai/resume-rewriter/rewrite-schema";
import type { RewriteStyle } from "@/lib/ai/resume-rewriter/rewrite-schema";

type Props = {
  style: RewriteStyle;
  onStyleChange: (style: RewriteStyle) => void;
  targetContext: string;
  onTargetContextChange: (value: string) => void;
};

export default function RewriteStylePicker({ style, onStyleChange, targetContext, onTargetContextChange }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-slate-700">Style</p>
      <div className="flex flex-wrap gap-2">
        {REWRITE_STYLES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onStyleChange(option)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              style === option ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <p className="mb-1.5 mt-4 text-sm font-semibold text-slate-700">Target context (optional)</p>
      <input
        value={targetContext}
        onChange={(event) => onTargetContextChange(event.target.value)}
        placeholder='e.g. "AI Engineer role", "banking domain"'
        className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-500"
      />
    </div>
  );
}

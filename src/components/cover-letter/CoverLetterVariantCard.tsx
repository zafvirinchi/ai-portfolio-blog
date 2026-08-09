"use client";

import type { CoverLetterVariant } from "@/lib/ai/cover-letter/cover-schema";

type Props = {
  variant: CoverLetterVariant;
  isAccepted: boolean;
  loading: boolean;
  onAccept: () => void;
};

export default function CoverLetterVariantCard({ variant, isAccepted, loading, onAccept }: Props) {
  return (
    <div className={`rounded-2xl border p-6 shadow-sm ${isAccepted ? "border-green-400 bg-green-50/40" : "border-slate-200 bg-white"}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Version {variant.version}</span>
          <span className="text-xs text-slate-400">{variant.wordCount} words</span>
          {isAccepted && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Accepted</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(variant.sections.fullText)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Copy
          </button>
          {!isAccepted && (
            <button
              type="button"
              onClick={onAccept}
              disabled={loading}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              Accept
            </button>
          )}
        </div>
      </div>

      <p className="whitespace-pre-line text-sm leading-7 text-slate-800">{variant.sections.fullText}</p>
    </div>
  );
}

"use client";

import type { TextVariant, VariantVersion } from "@/lib/ai/resume-rewriter/rewrite-schema";
import RewriteDiffView from "./RewriteDiffView";

type Props = {
  original: string;
  variants: TextVariant[];
  selected: VariantVersion | undefined;
  onSelect: (version: VariantVersion) => void;
};

export default function RewriteVariantPicker({ original, variants, selected, onSelect }: Props) {
  if (variants.length === 0) {
    return <p className="text-sm text-slate-400">No valid rewrite was generated for this — the original text was kept.</p>;
  }

  const activeVersion = selected ?? variants[0].version;

  return (
    <div className="space-y-3">
      {variants.map((variant) => (
        <label
          key={variant.version}
          className={`block cursor-pointer rounded-xl border p-4 transition ${
            activeVersion === variant.version ? "border-blue-400 bg-blue-50/50" : "border-slate-200 bg-white"
          }`}
        >
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="radio" checked={activeVersion === variant.version} onChange={() => onSelect(variant.version)} />
            Version {variant.version}
          </div>

          <RewriteDiffView original={original} rewritten={variant.text} />

          <details className="mt-2 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold text-blue-600">Why this is better</summary>
            <p className="mt-1">{variant.explanation.whyBetter}</p>
            {variant.explanation.keywordsAdded.length > 0 && (
              <p className="mt-1">Keywords added: {variant.explanation.keywordsAdded.join(", ")}</p>
            )}
            {variant.explanation.atsImprovements.length > 0 && (
              <p className="mt-1">ATS improvements: {variant.explanation.atsImprovements.join(", ")}</p>
            )}
            <p className="mt-1">Readability: {variant.explanation.readabilityImprovement}</p>
            <p className="mt-1">Tone: {variant.explanation.toneImprovement}</p>
          </details>
        </label>
      ))}
    </div>
  );
}

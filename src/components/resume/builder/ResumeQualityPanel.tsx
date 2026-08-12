"use client";

import type { DynamicResumeDocument } from "@/lib/ai/resume-versions/dynamic/dynamic-resume-schema";
import { checkResumeQuality } from "@/lib/ai/resume-versions/dynamic/resume-quality";
import type { ResolvedTemplateStyles } from "@/lib/ai/resume-versions/templates/template-styles";

// Informational only — never blocks export (§25). Every check here is
// something checkResumeQuality() can actually verify; nothing is
// fabricated to fill out a longer checklist.
export default function ResumeQualityPanel({ document, styles }: { document: DynamicResumeDocument; styles: ResolvedTemplateStyles }) {
  const report = checkResumeQuality(document, styles);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-800">Resume Quality</h2>
      <p className="mt-1 text-xs text-slate-400">Estimated length: {report.estimatedPageCount} page{report.estimatedPageCount === 1 ? "" : "s"}</p>

      <ul className="mt-3 space-y-1.5">
        {report.checks.map((check) => (
          <li key={check.label} className={`flex items-center gap-2 text-sm ${check.passed ? "text-green-700" : "text-slate-400"}`}>
            <span aria-hidden>{check.passed ? "✓" : "○"}</span>
            {check.label}
          </li>
        ))}
      </ul>

      {report.warnings.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
          {report.warnings.map((warning, index) => (
            <p key={index} className="flex items-start gap-2 text-xs text-amber-700">
              <span aria-hidden>⚠</span>
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

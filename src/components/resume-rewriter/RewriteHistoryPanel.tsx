"use client";

import type { SectionVersionEntry } from "@/lib/ai/resume-rewriter/rewrite-types";

type Props = {
  versions: SectionVersionEntry[];
  loading: boolean;
  onRestore: (versionIndex: number) => void;
};

export default function RewriteHistoryPanel({ versions, loading, onRestore }: Props) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-500">
        History ({versions.length} version{versions.length === 1 ? "" : "s"})
      </summary>
      <div className="mt-2 space-y-2">
        {versions.map((version, index) => (
          <div key={index} className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-xs">
            <span className="text-slate-600">
              {version.label} — {new Date(version.createdAt).toLocaleString()}
            </span>
            <button
              type="button"
              onClick={() => onRestore(index)}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}

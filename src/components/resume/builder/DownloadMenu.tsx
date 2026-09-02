"use client";

import { useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo } from "@/lib/billing/entitlement-client-error";
import { downloadExport } from "@/lib/billing/export-download";

// Phase 25 Milestone 2 — genuine defect fix: this component previously
// used a plain <a href> pointing straight at the export API route. A
// plain <a href> can't intercept a JSON error response (401 expired
// session, 404 deleted/not-found version, or a future 402 if
// resume.export is ever tiered) — the browser just navigates the whole
// tab to the raw JSON body instead of downloading a file, exactly the
// bug class already found and fixed 3 times elsewhere in this repo
// (RecruiterReportsTab.tsx/RecruiterComparisonTab.tsx/
// RecruiterCandidateTable.tsx, all via the shared downloadExport()
// helper). Converted to the same fetch+blob pattern — the success path
// still produces an identical real browser download; only a rejection's
// presentation changes, to the same UpgradePrompt this repo already
// uses everywhere else for a structured entitlement error.
const FORMATS: { format: string; label: string; filename: string }[] = [
  { format: "pdf", label: "PDF", filename: "resume.pdf" },
  { format: "docx", label: "DOCX", filename: "resume.docx" },
  { format: "markdown", label: "Markdown", filename: "resume.md" },
  { format: "txt", label: "TXT", filename: "resume.txt" },
];

export default function DownloadMenu({
  versionId,
  atsFriendliness,
  hasPdfUnsafeCharacters = false,
}: {
  versionId: string;
  atsFriendliness: "high" | "medium";
  /** Phase 25 Milestone 2 — see dynamic-resume-render.ts's containsPdfUnsafeCharacters() doc comment: pdfkit's built-in fonts have no glyph coverage outside Latin-1, so such characters silently vanish from the PDF. Surfaced here as a visible, honest warning instead of silence. */
  hasPdfUnsafeCharacters?: boolean;
}) {
  const [pendingFormat, setPendingFormat] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleDownload(format: string, filename: string) {
    setPendingFormat(format);
    setEntitlementError(null);
    setExportError(null);

    const result = await downloadExport(`/api/ai/resume/versions/${versionId}/export?format=${format}`, filename);

    if (result && "networkError" in result) {
      setExportError(result.networkError);
    } else if (result) {
      setEntitlementError(result);
    }

    setPendingFormat(null);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Download Resume</span>

        <div className="flex flex-wrap gap-2">
          {FORMATS.map(({ format, label, filename }) => (
            <button
              key={format}
              type="button"
              onClick={() => handleDownload(format, filename)}
              disabled={pendingFormat === format}
              aria-label={`Download resume as ${label}`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingFormat === format ? "Downloading..." : label}
            </button>
          ))}
        </div>

        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
            atsFriendliness === "high" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}
          title={atsFriendliness === "high" ? "This layout uses a single-column structure applicant tracking systems can parse reliably." : "This layout uses a two-column structure — some applicant tracking systems parse these less reliably. Enable ATS Friendly Mode for the safest structure."}
        >
          {atsFriendliness === "high" ? "ATS Friendly ✓" : "ATS Compatibility: Medium"}
        </span>
      </div>

      {hasPdfUnsafeCharacters && (
        <p className="mt-3 text-xs text-amber-700">
          ⚠ This resume contains characters (e.g. a non-Latin script) that may not display correctly in the PDF format. DOCX preserves them correctly.
        </p>
      )}

      {entitlementError && (
        <UpgradePrompt
          className="mt-3"
          featureLabel="Resume Export"
          code={entitlementError.code}
          featureId={entitlementError.featureId}
          message={entitlementError.message}
          limit={entitlementError.limit}
          used={entitlementError.used}
          period={entitlementError.period}
        />
      )}

      {!entitlementError && exportError && <p className="mt-3 text-xs font-semibold text-red-600">{exportError}</p>}
    </div>
  );
}

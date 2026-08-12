"use client";

// Only the 4 formats the export route actually implements — pdf, docx,
// markdown, txt (§30's "do not show fake buttons"). The ATS badge
// reflects the resolved template's actual rendering characteristics
// (single-column vs. sidebar, after ATS-mode collapse), never a
// number — the numeric ATS Score is a wholly separate, content-based
// feature (resume-score.ts) this badge must never be confused with (§31).
const FORMATS: { format: string; label: string; extension: string }[] = [
  { format: "pdf", label: "PDF", extension: "pdf" },
  { format: "docx", label: "DOCX", extension: "docx" },
  { format: "markdown", label: "Markdown", extension: "md" },
  { format: "txt", label: "TXT", extension: "txt" },
];

export default function DownloadMenu({ versionId, atsFriendliness }: { versionId: string; atsFriendliness: "high" | "medium" }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Download Resume</span>

      <div className="flex flex-wrap gap-2">
        {FORMATS.map(({ format, label }) => (
          <a
            key={format}
            href={`/api/ai/resume/versions/${versionId}/export?format=${format}`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {label}
          </a>
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
  );
}

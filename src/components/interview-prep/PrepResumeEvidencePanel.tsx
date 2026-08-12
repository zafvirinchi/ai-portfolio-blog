import type { ResumeEvidenceSummary } from "@/lib/ai/interview-prep/interview-coverage";

type Props = {
  evidence: ResumeEvidenceSummary;
};

// Phase 17 Milestone 4, §6 — every field here is read directly off the
// candidate's own Resume object (interview-coverage.ts's
// buildResumeEvidenceSummary(), zero LLM, zero new resume parser) —
// this component only ever renders what's genuinely present, omitting
// (not fabricating) any section with no real data.

function EvidenceGroup({ label, items, ariaLabel }: { label: string; items: string[]; ariaLabel: string }) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label={ariaLabel}>
        {items.map((item) => (
          <span key={item} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PrepResumeEvidencePanel({ evidence }: Props) {
  const hasAnyEvidence =
    evidence.currentRole || evidence.majorProjects.length > 0 || evidence.technologies.length > 0 || evidence.achievements.length > 0 || evidence.leadershipSignals.length > 0;

  if (!hasAnyEvidence) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-bold text-slate-700">Resume Evidence</h3>
      <p className="mt-1 text-xs text-slate-500">The real parts of your resume most likely to come up in the interview.</p>

      <div className="mt-4 space-y-4">
        {evidence.currentRole && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Role</p>
            <p className="mt-1 text-sm text-slate-700">
              {evidence.currentRole}
              {evidence.currentCompany ? ` at ${evidence.currentCompany}` : ""}
            </p>
          </div>
        )}

        <EvidenceGroup label="Major Projects" items={evidence.majorProjects} ariaLabel="Major projects from your resume" />
        <EvidenceGroup label="Technologies" items={evidence.technologies} ariaLabel="Technologies listed on your resume" />
        <EvidenceGroup label="Achievements" items={evidence.achievements} ariaLabel="Achievements listed on your resume" />

        {evidence.leadershipSignals.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leadership Signals</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-slate-700" aria-label="Leadership signals found in your work experience">
              {evidence.leadershipSignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

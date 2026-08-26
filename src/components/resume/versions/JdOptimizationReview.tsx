"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import type { JdMatchResult, OptimizationMode } from "@/lib/ai/job-description/jd-schema";
import { OPTIMIZATION_MODES } from "@/lib/ai/job-description/jd-schema";
import type { CertificationRequirementMatch, CertificationRequirementStatus, EducationRequirementMatch, EducationRequirementStatus } from "@/lib/ai/job-description/keyword-engine";
import type { ResumeChangeProposal } from "@/lib/ai/resume-versions/dynamic/optimization-review";
import type { JdOptimizationSummary, PriorityLevel } from "@/lib/ai/resume-versions/dynamic/jd-optimization-summary";

type ProposeResponse = {
  matchResult: JdMatchResult;
  proposals: ResumeChangeProposal[];
  currentAtsScore: number | null;
  projectedAtsScore: number;
  educationMatches: EducationRequirementMatch[];
  certificationMatches: CertificationRequirementMatch[];
  summary: JdOptimizationSummary;
};

const MODE_LABELS: Record<OptimizationMode, string> = {
  conservative: "Conservative — wording & keywords only",
  balanced: "Balanced — recommended",
  aggressive: "Aggressive — more extensive rewriting",
};

const SECTION_GROUP_LABELS: Record<string, string> = {
  SUMMARY: "Professional Summary",
  EXPERIENCE: "Experience",
  PROJECTS: "Projects",
  SKILLS: "Skills",
};

const EDUCATION_STATUS_LABEL: Record<EducationRequirementStatus, string> = {
  matched: "Matched",
  equivalent_or_higher: "Equivalent / Higher",
  missing: "Missing",
};

const CERTIFICATION_STATUS_LABEL: Record<CertificationRequirementStatus, string> = {
  matched: "Matched",
  related: "Related — not exact",
  missing: "Not Present",
};

// Milestone 17, §12 — JD Requirement / Resume Evidence / Status / Action
// row used for both the Education Match and Certification Match sections.
// This is purely informational: it never mutates the resume itself.
// "View / Edit" and "Add..." both hand off to the EXISTING Resume Builder
// (via onNavigateToBuilder) rather than opening a parallel editor here —
// nothing here ever pre-fills a fabricated degree/cert value.
function RequirementRow({
  requirement,
  resumeEvidence,
  statusLabel,
  statusTone,
  reason,
  actionLabel,
  onAction,
}: {
  requirement: string;
  resumeEvidence: string | null;
  statusLabel: string;
  statusTone: "matched" | "attention";
  reason?: string;
  actionLabel: string;
  onAction?: () => void;
}) {
  const toneClasses = statusTone === "matched" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-[2fr_2fr_auto_auto] sm:items-center">
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-400">JD Requirement</p>
          <p className="text-sm font-medium text-slate-800">{requirement}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-400">Resume Evidence</p>
          <p className="text-sm text-slate-600">{resumeEvidence ?? "Not found"}</p>
        </div>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-center text-[10px] font-bold uppercase ${toneClasses}`}>{statusLabel}</span>
        {onAction ? (
          <button
            type="button"
            onClick={onAction}
            aria-label={`${actionLabel}: ${requirement}`}
            className="whitespace-nowrap rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
          >
            {actionLabel}
          </button>
        ) : (
          <span className="whitespace-nowrap text-xs text-slate-400">{actionLabel}</span>
        )}
      </div>
      {/* A gap here always means adding a fact the user must confirm (a degree, a certification) — never fabricated automatically. */}
      {statusTone === "attention" && (
        <span className="mt-2 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">Requires Your Confirmation</span>
      )}
      {reason && <p className="mt-2 text-xs text-slate-500">{reason}</p>}
    </div>
  );
}

const PRIORITY_BADGE_CLASSES: Record<PriorityLevel, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-amber-100 text-amber-800",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-slate-100 text-slate-600",
};

/**
 * Milestone 18 — a deterministic, zero-extra-LLM-call reshaping of the
 * same matchResult/educationMatches/certificationMatches this component
 * already renders in full detail below (Education Match, Certification
 * Match, the partial/missing skills box). This panel is a concise,
 * recruiter-grade OVERVIEW of that same data — it never introduces a
 * second score, and "Review..." buttons scroll to the existing detail
 * sections rather than duplicating them.
 */
function JdOptimizationSummaryPanel({
  summary,
  onReviewGaps,
  onReviewProposals,
}: {
  summary: JdOptimizationSummary;
  onReviewGaps: () => void;
  onReviewProposals: () => void;
}) {
  const topPriorities = summary.priorities.slice(0, 5);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">JD Optimization Summary</p>

      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-500">
        <span>Overall Match</span>
        <span>{summary.overallMatchScore}%</span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${summary.overallMatchScore}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
        <span className="text-green-700">✓ {summary.matchedCount} Matched</span>
        <span className="text-amber-700">◐ {summary.relatedCount} Related</span>
        <span className="text-red-700">! {summary.missingCount} Missing</span>
      </div>

      {topPriorities.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Top Priorities</p>
          <div className="mt-2 space-y-2">
            {topPriorities.map((priority, index) => (
              <div key={`${priority.category}-${priority.title}`} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">
                  {index + 1}.{" "}
                  <span className={`mr-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_BADGE_CLASSES[priority.priority]}`}>{priority.priority}</span>
                  {priority.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">{priority.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Strengths</p>
          {summary.strengths.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-green-700">
              {summary.strengths.slice(0, 8).map((strength) => (
                <li key={`${strength.category}-${strength.title}`}>✓ {strength.title}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No strong matches identified yet.</p>
          )}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Gaps</p>
          {summary.gaps.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-red-700">
              {summary.gaps.slice(0, 8).map((gap) => (
                <li key={`${gap.category}-${gap.title}`}>! {gap.title}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No significant gaps found.</p>
          )}
        </div>
      </div>

      {summary.protectedContent.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Protected Facts</p>
          <p className="mt-1 text-xs text-slate-500">These are never changed automatically — review manually if anything below is factually incorrect.</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {summary.protectedContent.map((item) => (
              <li key={`${item.sectionType ?? "pii"}-${item.sectionId ?? "none"}`}>• {item.reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onReviewGaps} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">
          Review High-Priority Gaps
        </button>
        <button type="button" onClick={onReviewProposals} className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">
          Review Optimization Proposals
        </button>
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  accepted,
  editedText,
  onToggle,
  onEdit,
}: {
  proposal: ResumeChangeProposal;
  accepted: boolean;
  editedText: string | null;
  onToggle: () => void;
  onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const displayedProposed = editedText ?? (Array.isArray(proposal.proposedValue) ? proposal.proposedValue.join(", ") : proposal.proposedValue);
  const description = `${SECTION_GROUP_LABELS[proposal.sectionType] ?? proposal.sectionType} rewrite`;

  return (
    <div className={`rounded-xl border p-4 ${accepted ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-slate-50 opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* A rewrite proposal only ever changes WORDING of content the user already entered — never a new employer/degree/certification/date (Protected Facts) — so it's always Safe. */}
          <span className="mb-2 inline-block rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">Safe to Apply</span>
          <p className="text-xs font-semibold text-slate-400">Before</p>
          <p className="mt-1 text-sm text-slate-500 line-through decoration-slate-300">
            {Array.isArray(proposal.originalValue) ? proposal.originalValue.join(", ") : proposal.originalValue || "(empty)"}
          </p>

          <p className="mt-3 text-xs font-semibold text-blue-600">After</p>
          {editing ? (
            <textarea
              autoFocus
              value={displayedProposed}
              onChange={(event) => onEdit(event.target.value)}
              onBlur={() => setEditing(false)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-blue-300 px-3 py-2 text-sm"
            />
          ) : (
            <p className="mt-1 text-sm font-medium text-slate-800">{displayedProposed}</p>
          )}

          <p className="mt-2 text-xs text-slate-500">
            <span className="font-semibold">Reason:</span> {proposal.reason}
          </p>
          {proposal.matchedRequirement && (
            <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">Addresses: {proposal.matchedRequirement}</span>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col gap-1.5 text-xs font-semibold">
          <button
            type="button"
            onClick={onToggle}
            aria-label={accepted ? `${description} accepted` : `Accept proposed ${description}`}
            className={`rounded-lg px-3 py-1.5 ${accepted ? "bg-green-600 text-white" : "border border-slate-300 text-slate-600"}`}
          >
            {accepted ? "Accepted" : "Accept"}
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-label={!accepted ? `${description} rejected` : `Reject proposed ${description}`}
            className={`rounded-lg px-3 py-1.5 ${!accepted ? "bg-red-600 text-white" : "border border-slate-300 text-slate-600"}`}
          >
            {!accepted ? "Rejected" : "Reject"}
          </button>
          {proposal.autoApplicable && proposal.fieldKey !== "skillsReorganization" && (
            <button type="button" onClick={() => setEditing((value) => !value)} aria-label={`Edit proposed ${description}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600">
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JdOptimizationReview({
  versionId,
  isMaster = false,
  onNavigateToBuilder,
  onApplied,
}: {
  versionId: string;
  isMaster?: boolean;
  onNavigateToBuilder?: () => void;
  /**
   * Phase 15 Milestone 8 (§19) — called after a successful apply
   * TO THIS SAME VERSION (never for the "new version" path, where
   * this version's own data is unaffected and the user instead gets
   * a link to the new one). Lets the parent re-fetch the version so
   * its ATS score, Resume Health, Section Completeness, etc. — all
   * computed from `resumeData`, which the apply just changed —
   * reflect the update without a manual page reload. Reuses whatever
   * refresh function the parent already has (VersionDetail.tsx's own
   * existing `load()`) rather than this component managing that data.
   */
  onApplied?: () => void;
}) {
  const [jdText, setJdText] = useState("");
  const [mode, setMode] = useState<OptimizationMode>("balanced");

  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [proposeEntitlementError, setProposeEntitlementError] = useState<EntitlementErrorInfo | null>(null);
  const [result, setResult] = useState<ProposeResponse | null>(null);

  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});

  const [target, setTarget] = useState<"new" | "current">("new");
  const [newVersionName, setNewVersionName] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{ versionId: string; createdNewVersion: boolean; appliedCount: number; staleCount: number } | null>(null);

  // Milestone 18 — "Review High-Priority Gaps"/"Review Optimization
  // Proposals" scroll to the EXISTING detail sections below rather than
  // duplicating them in the summary panel itself.
  const gapDetailsRef = useRef<HTMLDivElement>(null);
  const proposalsRef = useRef<HTMLDivElement>(null);

  async function handleAnalyze() {
    if (!jdText.trim()) return;
    setProposing(true);
    setProposeError(null);
    setProposeEntitlementError(null);
    setResult(null);
    setApplyResult(null);

    try {
      const response = await fetch(`/api/ai/resume/versions/${versionId}/jd-optimize/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescriptionText: jdText.trim(), mode }),
      });
      const data = await response.json();
      if (!response.ok) {
        // Phase 23 Milestone 5 — this route shares the JD_MATCHES quota
        // with JdUpload.tsx/ResumeOptimizerPanel.tsx, which already
        // handle a rejection via UpgradePrompt — this sibling panel
        // previously showed a plain error string instead.
        const entitlement = readEntitlementError(data, "Failed to analyze this job description");
        if (entitlement) {
          setProposeEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Failed to analyze this job description");
      }

      setResult(data);
      // Every AUTO-APPLICABLE proposal starts accepted — "Accept All" is
      // the fast, default path; the user opts OUT rather than in.
      // Education/Certification gap proposals are never auto-applicable
      // (see ActionNeededCard) and deliberately never enter this state
      // at all, so they can never end up in an /apply request.
      const initialDecisions: Record<string, boolean> = {};
      for (const proposal of data.proposals as ResumeChangeProposal[]) {
        if (proposal.autoApplicable) initialDecisions[proposal.id] = true;
      }
      setDecisions(initialDecisions);
      setEdits({});
    } catch (err) {
      setProposeError(err instanceof Error ? err.message : "Failed to analyze this job description.");
    } finally {
      setProposing(false);
    }
  }

  async function handleApply() {
    if (!result) return;
    const acceptedProposals = result.proposals
      .filter((proposal) => decisions[proposal.id])
      .map((proposal) => (edits[proposal.id] !== undefined ? { ...proposal, proposedValue: edits[proposal.id] } : proposal));

    setApplying(true);
    setApplyError(null);

    try {
      const response = await fetch(`/api/ai/resume/versions/${versionId}/jd-optimize/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposals: acceptedProposals, target, newVersionName: newVersionName.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to apply the selected changes");

      // Phase 15 Milestone 9 (§10/§11) — report exactly what happened,
      // never a blanket "success": a proposal can come back
      // "skipped_stale" if the resume changed since these proposals
      // were generated (e.g. edited in the Builder in another tab).
      const proposalResults = (data.results ?? []) as { proposalId: string; outcome: string }[];
      const appliedCount = proposalResults.filter((r) => r.outcome === "applied").length;
      const staleCount = proposalResults.filter((r) => r.outcome === "skipped_stale").length;

      setApplyResult({ versionId: data.version.id, createdNewVersion: Boolean(data.createdNewVersion), appliedCount, staleCount });
      if (!data.createdNewVersion) onApplied?.();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to apply the selected changes.");
    } finally {
      setApplying(false);
    }
  }

  const applicableProposals = result ? result.proposals.filter((proposal) => proposal.autoApplicable) : [];
  const gapProposals = result ? result.proposals.filter((proposal) => !proposal.autoApplicable) : [];
  const acceptedCount = applicableProposals.filter((proposal) => decisions[proposal.id]).length;

  // Carries each gap proposal's explanatory copy (e.g. the "related
  // certification" callout) over to the Education Match / Certification
  // Match tables above, keyed by the JD requirement text both share.
  const educationReasonByRequirement = new Map(
    gapProposals.filter((proposal) => proposal.sectionType === "EDUCATION" && proposal.matchedRequirement).map((proposal) => [proposal.matchedRequirement as string, proposal.reason])
  );
  const certificationReasonByRequirement = new Map(
    gapProposals.filter((proposal) => proposal.sectionType === "CERTIFICATIONS" && proposal.matchedRequirement).map((proposal) => [proposal.matchedRequirement as string, proposal.reason])
  );

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5">
      <h2 className="text-sm font-bold text-slate-800">Optimize for a Job Description</h2>
      <p className="mt-1 text-xs text-slate-500">
        Paste a job description and review each suggested change before anything is saved — your resume is never modified automatically.
      </p>

      <textarea
        value={jdText}
        onChange={(event) => setJdText(event.target.value)}
        rows={5}
        placeholder="Paste the job description here..."
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-slate-600">
          Optimization mode
          <select value={mode} onChange={(event) => setMode(event.target.value as OptimizationMode)} className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {OPTIMIZATION_MODES.map((option) => (
              <option key={option} value={option}>
                {MODE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={handleAnalyze}
          disabled={proposing || !jdText.trim()}
          aria-label="Optimize resume for this job description"
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {proposing ? "Analyzing changes..." : "Analyze Changes"}
        </button>
      </div>

      {proposeEntitlementError ? (
        <UpgradePrompt
          className="mt-3"
          featureLabel="JD Optimization"
          code={proposeEntitlementError.code}
          featureId={proposeEntitlementError.featureId}
          message={proposeEntitlementError.message}
          limit={proposeEntitlementError.limit}
          used={proposeEntitlementError.used}
          period={proposeEntitlementError.period}
          onRetry={handleAnalyze}
        />
      ) : (
        proposeError && <p className="mt-2 text-xs font-semibold text-red-600">{proposeError}</p>
      )}

      {result && (
        <div className="mt-6 space-y-4 border-t border-blue-100 pt-5">
          <JdOptimizationSummaryPanel
            summary={result.summary}
            onReviewGaps={() => gapDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            onReviewProposals={() => proposalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white p-3 text-center shadow-sm">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Overall Match</p>
              <p className="text-xl font-bold text-slate-900">{result.matchResult.overallMatch}%</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Current ATS Score</p>
              <p className="text-xl font-bold text-slate-900">{result.currentAtsScore ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm">
              <p className="text-[10px] font-semibold uppercase text-blue-500">Projected ATS Score*</p>
              <p className="text-xl font-bold text-blue-700">{result.projectedAtsScore}</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center shadow-sm">
              <p className="text-[10px] font-semibold uppercase text-slate-400">Changes Proposed</p>
              <p className="text-xl font-bold text-slate-900">{applicableProposals.length}</p>
            </div>
          </div>
          {gapProposals.length > 0 && (
            <p className="text-xs text-amber-600">
              ⚠ {gapProposals.length} education/certification requirement{gapProposals.length === 1 ? "" : "s"} need your confirmation — see below.
            </p>
          )}
          <p className="text-[11px] text-slate-400">*Projected — an estimate of your ATS score if the currently-accepted changes below are applied. Not a guaranteed score.</p>

          <div ref={gapDetailsRef} className="space-y-4">
            {(result.matchResult.partialSkills.length > 0 || result.matchResult.missingSkills.length > 0) && (
              <div className="rounded-xl bg-white p-4 shadow-sm">
                {result.matchResult.partialSkills.length > 0 && (
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-amber-600">◐ Partial match:</span>{" "}
                    {result.matchResult.partialSkills.map((p) => `${p.jdSkill} (via ${p.resumeSkill})`).join(", ")}
                  </p>
                )}
                {result.matchResult.missingSkills.length > 0 && (
                  <p className="mt-1 text-xs text-slate-600">
                    <span className="font-semibold text-red-600">✕ Missing:</span> {result.matchResult.missingSkills.join(", ")}
                  </p>
                )}
              </div>
            )}

            {/* Milestone 17 — shows EVERY JD education/certification
                requirement (matched, equivalent/related, and missing), not
                just the gaps: distinct from — and rendered independently of
                — the auto-apply proposal flow below, since a fully-matched
                requirement never produces a proposal at all. */}
            {result.educationMatches.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Education Match</p>
                <div className="space-y-2">
                  {result.educationMatches.map((match) => (
                    <RequirementRow
                      key={match.requirement}
                      requirement={match.requirement}
                      resumeEvidence={match.resumeEvidence}
                      statusLabel={EDUCATION_STATUS_LABEL[match.status]}
                      statusTone={match.status === "missing" ? "attention" : "matched"}
                      reason={match.status === "missing" ? educationReasonByRequirement.get(match.requirement) : undefined}
                      actionLabel={match.status === "missing" ? "Add Education" : "View / Edit"}
                      onAction={onNavigateToBuilder}
                    />
                  ))}
                </div>
              </div>
            )}

            {result.certificationMatches.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Certification Match</p>
                <div className="space-y-2">
                  {result.certificationMatches.map((match) => (
                    <RequirementRow
                      key={match.requirement}
                      requirement={match.requirement}
                      resumeEvidence={match.resumeEvidence}
                      statusLabel={CERTIFICATION_STATUS_LABEL[match.status]}
                      statusTone={match.status === "matched" ? "matched" : "attention"}
                      reason={match.status !== "matched" ? certificationReasonByRequirement.get(match.requirement) : undefined}
                      actionLabel={match.status === "matched" ? "View / Edit" : "Add Certification"}
                      onAction={onNavigateToBuilder}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {applicableProposals.length === 0 && gapProposals.length === 0 ? (
            <p className="text-sm text-slate-500">No changes to propose — your resume already reads well for this job description.</p>
          ) : (
            <div ref={proposalsRef} className="space-y-4">
              {applicableProposals.length > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Suggested Changes ({acceptedCount} of {applicableProposals.length} selected)
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDecisions(Object.fromEntries(applicableProposals.map((p) => [p.id, true])))}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Accept All
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecisions(Object.fromEntries(applicableProposals.map((p) => [p.id, false])))}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Reject All
                    </button>
                  </div>
                </div>
              )}

              {(["SUMMARY", "EXPERIENCE", "PROJECTS", "SKILLS"] as const).map((sectionType) => {
                const groupProposals = applicableProposals.filter((p) => p.sectionType === sectionType);
                if (groupProposals.length === 0) return null;

                return (
                  <div key={sectionType}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">{SECTION_GROUP_LABELS[sectionType]}</p>
                    <div className="space-y-2">
                      {groupProposals.map((proposal) => (
                        <ProposalCard
                          key={proposal.id}
                          proposal={proposal}
                          accepted={decisions[proposal.id] ?? false}
                          editedText={edits[proposal.id] ?? null}
                          onToggle={() => setDecisions((current) => ({ ...current, [proposal.id]: !current[proposal.id] }))}
                          onEdit={(text) => setEdits((current) => ({ ...current, [proposal.id]: text }))}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* §17 — "do not show Apply Safe Improvements when there are none" — this whole card (including the disabled button it used to always render) is skipped entirely when there's nothing safe to apply, even if manual (gap) items exist above. */}
              {applicableProposals.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                  Your resume has no safe automatic improvements available for this job description right now.
                  {gapProposals.length > 0 && " See the requirements above that need your confirmation."}
                </div>
              ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Apply Changes</p>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="radio" name="apply-target" checked={target === "new"} onChange={() => setTarget("new")} />
                    Apply to a new version (recommended — this version stays unchanged)
                  </label>
                  {target === "new" && (
                    <input
                      value={newVersionName}
                      onChange={(event) => setNewVersionName(event.target.value)}
                      placeholder="New version name (optional)"
                      className="ml-6 w-64 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    />
                  )}
                  {!isMaster && (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="radio" name="apply-target" checked={target === "current"} onChange={() => setTarget("current")} />
                      Apply to this version directly
                    </label>
                  )}
                  {isMaster && <p className="text-xs text-slate-400">Your Master Resume can only receive changes via a new version — it can never be modified by an AI operation.</p>}
                </div>

                {applyError && <p className="mt-2 text-xs font-semibold text-red-600">{applyError}</p>}

                {applyResult ? (
                  <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                    {applyResult.createdNewVersion ? (
                      <>
                        {applyResult.appliedCount} change{applyResult.appliedCount === 1 ? "" : "s"} applied to a new version.{" "}
                        <Link href={`/resume-analyzer/versions/${applyResult.versionId}`} className="font-semibold underline">
                          View it here
                        </Link>
                        .
                      </>
                    ) : (
                      `${applyResult.appliedCount} change${applyResult.appliedCount === 1 ? "" : "s"} applied to this version.`
                    )}
                    {/* §11 — partial success is reported honestly, never folded into a blanket "all applied". */}
                    {applyResult.staleCount > 0 && (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        {applyResult.staleCount} recommendation{applyResult.staleCount === 1 ? " was" : "s were"} outdated because your resume changed since these were generated, and{" "}
                        {applyResult.staleCount === 1 ? "was" : "were"} skipped.{" "}
                        <button type="button" onClick={handleAnalyze} className="font-semibold underline">
                          Regenerate Recommendations
                        </button>
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleApply}
                    disabled={applying || acceptedCount === 0}
                    aria-label="Apply all selected safe improvements"
                    className="mt-3 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {applying ? "Applying..." : `Apply ${acceptedCount} Selected Change${acceptedCount === 1 ? "" : "s"}`}
                  </button>
                )}
              </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import { ALLOWED_STATUS_TRANSITIONS, CANDIDATE_TAGS, NOTE_CATEGORIES, CandidateStatus, CandidateTag, NoteCategory } from "@/lib/ai/recruiter/candidate-schema";
import { buildInterviewEligibility, buildInterviewReadinessView } from "@/lib/ai/recruiter/candidate-interview";
import type { CandidateFitLevel, CandidateProfile, EvaluationStatus } from "@/lib/ai/recruiter/candidate-types";
import type { RecruiterJobRecord } from "@/lib/ai/recruiter/recruiter-job-types";

interface InterviewLink {
  available: boolean;
  resumeId?: string;
  jdMatchId?: string;
}

// Phase 16 Milestone 1, §8 — same fit-level palette recruiter/page.tsx's ranking list already uses.
const FIT_LEVEL_CLASSNAME: Record<CandidateFitLevel, string> = {
  STRONG: "bg-green-100 text-green-700",
  GOOD: "bg-blue-100 text-blue-700",
  MODERATE: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

const EVALUATION_STATUS_LABEL: Record<EvaluationStatus, string> = {
  not_evaluated: "Not Evaluated",
  complete: "Evaluation Complete",
  stale: "Evaluation Stale — job changed since last match",
};

const EVALUATION_STATUS_CLASSNAME: Record<EvaluationStatus, string> = {
  not_evaluated: "bg-slate-100 text-slate-600",
  complete: "bg-green-100 text-green-700",
  stale: "bg-amber-100 text-amber-700",
};

export default function CandidateProfilePage() {
  const params = useParams<{ candidateId: string }>();
  const candidateId = params.candidateId;

  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Distinct from `error` (which replaces the whole page with a "not
  // found" state) — an evaluation/match action failing must never make
  // an already-loaded candidate look like it vanished (§15/§29): it
  // shows as an inline banner alongside the still-visible profile.
  const [actionError, setActionError] = useState<string | null>(null);
  // Phase 19 M4, Step 5-8 — distinct from actionError: a genuine
  // entitlement rejection (FEATURE_NOT_INCLUDED/QUOTA_EXCEEDED/
  // AUTH_REQUIRED) renders the same UpgradePrompt every other gated
  // surface already uses, instead of a plain error string.
  const [actionEntitlementError, setActionEntitlementError] = useState<EntitlementErrorInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteCategory, setNoteCategory] = useState<NoteCategory>("Recruiter");
  const [noteText, setNoteText] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");
  const [jobs, setJobs] = useState<RecruiterJobRecord[]>([]);
  const [matchJobId, setMatchJobId] = useState("");
  const [interviewLink, setInterviewLink] = useState<InterviewLink | null>(null);
  const [feedbackFields, setFeedbackFields] = useState({
    technical: "",
    communication: "",
    roleFit: "",
    strengths: "",
    concerns: "",
    recommendation: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/recruiter/candidates/${candidateId}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Candidate not found");

      setProfile(data);
      setNoticePeriod(data.record.noticePeriod ?? "");
      setExpectedSalary(data.record.expectedSalary ?? "");
      if (data.record.jobId) setMatchJobId(data.record.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Candidate not found.");
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/ai/recruiter/jobs")
      .then((response) => response.json())
      .then((data) => setJobs(Array.isArray(data) ? data : []))
      .catch(() => setJobs([]));
  }, []);

  // Phase 16 Milestone 8, §10 — resumeId/jdMatchId for the Interview
  // Preparation / Mock Interview deep links are always resolved
  // server-side (candidateService.getInterviewLinkParams), never built
  // from anything on this page — this candidate's own attached job is
  // the only job that can ever be involved.
  useEffect(() => {
    fetch(`/api/ai/recruiter/candidates/${candidateId}/interview-link`)
      .then((response) => response.json())
      .then((data) => setInterviewLink(data))
      .catch(() => setInterviewLink({ available: false }));
  }, [candidateId]);

  async function handleStatusChange(status: CandidateStatus) {
    setBusy("status");
    setActionError(null);
    try {
      const response = await fetch(`/api/ai/recruiter/candidates/${candidateId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: decisionNote.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Status update failed");
      setDecisionNote("");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Status update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleTag(tag: CandidateTag) {
    if (!profile) return;
    const current = profile.record.tags;
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];

    setBusy("tags");
    try {
      await fetch(`/api/ai/recruiter/candidates/${candidateId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: next }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveFields() {
    setBusy("fields");
    try {
      await fetch(`/api/ai/recruiter/candidates/${candidateId}/fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noticePeriod, expectedSalary }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;

    setBusy("note");
    try {
      await fetch(`/api/ai/recruiter/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: noteCategory, text: noteText.trim() }),
      });
      setNoteText("");
      await load();
    } finally {
      setBusy(null);
    }
  }

  // Phase 16 Milestone 8, §5 — audited first: NOTE_CATEGORIES already
  // includes "Interview" (candidate-schema.ts, Phase 13), and NoteEntry
  // is already free-form text — no new feedback table/schema. This
  // composes the optional structured fields into one formatted note
  // rather than requiring all of them (§5's explicit instruction).
  // Never sent to an LLM.
  async function handleLogInterviewFeedback() {
    const { technical, communication, roleFit, strengths, concerns, recommendation } = feedbackFields;
    const sections: { label: string; value: string }[] = [
      { label: "Technical", value: technical },
      { label: "Communication", value: communication },
      { label: "Role Fit", value: roleFit },
      { label: "Strengths", value: strengths },
      { label: "Concerns", value: concerns },
      { label: "Recommendation", value: recommendation },
    ].filter((section) => section.value.trim().length > 0);

    if (sections.length === 0) return;

    const text = sections.map((section) => `${section.label}: ${section.value.trim()}`).join("\n");

    setBusy("interview-feedback");
    try {
      await fetch(`/api/ai/recruiter/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "Interview", text }),
      });
      setFeedbackFields({ technical: "", communication: "", roleFit: "", strengths: "", concerns: "", recommendation: "" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleMatchJd() {
    if (!matchJobId) {
      setError("Choose a job to match against first.");
      return;
    }

    setBusy("match");
    setActionError(null);
    setActionEntitlementError(null);
    try {
      const response = await fetch(`/api/ai/recruiter/candidates/${candidateId}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: matchJobId }),
      });
      const data = await response.json();
      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Matching against the job failed.");
        if (entitlement) {
          setActionEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error);
      }
      await load();
    } catch (err) {
      // §16 — a failed match must never discard the candidate's already-persisted ATS score or prior state; load() is simply not called on failure, so the profile keeps showing its last-known-good data.
      setActionError(err instanceof Error ? err.message : "Matching against the job failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReEvaluate() {
    setBusy("evaluate");
    setActionError(null);
    setActionEntitlementError(null);
    try {
      const response = await fetch(`/api/ai/recruiter/candidates/${candidateId}/evaluate`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Re-evaluation failed");
        if (entitlement) {
          setActionEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Re-evaluation failed");
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Re-evaluation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateInsights() {
    setBusy("insights");
    setActionError(null);
    setActionEntitlementError(null);
    try {
      const response = await fetch(`/api/ai/recruiter/candidates/${candidateId}/insights`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Insights generation failed.");
        if (entitlement) {
          setActionEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Insights generation failed.");
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Insights generation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateReadiness() {
    setBusy("readiness");
    setActionError(null);
    setActionEntitlementError(null);
    try {
      const response = await fetch(`/api/ai/recruiter/candidates/${candidateId}/interview-readiness`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Interview readiness generation failed.");
        if (entitlement) {
          setActionEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error);
      }
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Interview readiness generation failed.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center text-slate-500">Loading candidate...</div>
      </section>
    );
  }

  if (error || !profile) {
    return (
      <section className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-900">Candidate not available</p>
          <p className="mt-2 text-sm text-slate-600">{error ?? "This candidate could not be found."}</p>
          <Link href="/recruiter" className="mt-5 inline-block rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            Back to Workspace
          </Link>
        </div>
      </section>
    );
  }

  const { summary, record, resume, jdMatchResult, recruiterSummary, atsExplanation } = profile;
  const interviewEligibility = buildInterviewEligibility(summary, jdMatchResult?.missingSkills ?? []);
  const interviewReadinessView = buildInterviewReadinessView(profile);

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/recruiter" className="text-sm font-semibold text-blue-600 hover:underline">
          ← Back to Workspace
        </Link>

        {actionEntitlementError && (
          <UpgradePrompt
            featureLabel="Candidate Evaluation"
            code={actionEntitlementError.code}
            featureId={actionEntitlementError.featureId}
            message={actionEntitlementError.message}
            limit={actionEntitlementError.limit}
            used={actionEntitlementError.used}
            period={actionEntitlementError.period}
          />
        )}

        {actionError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Evaluation Failed — {actionError}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{summary.name}</h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${FIT_LEVEL_CLASSNAME[summary.fitLevel]}`}
                  aria-label={`Candidate fit level: ${summary.fitLevel}`}
                >
                  {summary.fitLevel}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${EVALUATION_STATUS_CLASSNAME[summary.evaluationStatus]}`}
                  aria-label={`Evaluation status: ${EVALUATION_STATUS_LABEL[summary.evaluationStatus]}`}
                >
                  {EVALUATION_STATUS_LABEL[summary.evaluationStatus]}
                </span>
              </div>
              <p className="text-slate-600">
                {summary.currentRole ?? "Role unknown"} at {summary.currentCompany ?? "unknown company"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {resume.contact.email ?? "no email"} · {resume.contact.phone ?? "no phone"} · {summary.location ?? "location unknown"}
              </p>
              <p className="mt-1 text-sm text-slate-500">Job: {record.jobId ? jobs.find((job) => job.id === record.jobId)?.title ?? "…" : "Unattached"}</p>
            </div>

            <select
              value={record.status}
              onChange={(e) => handleStatusChange(e.target.value as CandidateStatus)}
              disabled={busy === "status"}
              aria-label="Recruiter decision status"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold"
            >
              {/* Phase 16 Milestone 7, §1/§6 — only the current status plus its own valid next states, matching the screening table's dropdown exactly. */}
              {[record.status, ...ALLOWED_STATUS_TRANSITIONS[record.status]].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {CANDIDATE_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => handleToggleTag(tag)}
                disabled={busy === "tags"}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  record.tags.includes(tag) ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/resume-rewriter?resumeId=${record.resumeId}`}
              className="inline-block rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Rewrite this resume
            </Link>
            <Link
              href={`/recruitment?candidateId=${candidateId}`}
              className="inline-block rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Add to a job pipeline
            </Link>
          </div>
        </div>

        {/* Phase 16 Milestone 7, §6/§7 — the Recruiter Decision panel. The status dropdown itself lives in the header card above (already constrained to valid transitions); this panel holds the optional decision note and the resulting history log — the recruiter, not the system, remains the decision maker (§13's explicit caution, reused from Milestone 4's recommendedAction). */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Recruiter Decision</h3>
          <p className="text-sm text-slate-700">
            Current status: <span className="font-semibold">{record.status}</span>
          </p>
          <label className="mb-1 mt-3 block text-xs text-slate-500" htmlFor="decision-note">
            Decision note (optional — applied to the next status change)
          </label>
          <input
            id="decision-note"
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder="e.g. Strong Java background, moving to interview..."
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />

          {record.decisionHistory.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No status changes recorded yet.</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm" aria-label="Decision history">
              {[...record.decisionHistory].reverse().map((entry) => (
                <li key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="font-medium text-slate-800">
                    {entry.previousStatus} → {entry.newStatus}
                  </p>
                  <p className="text-xs text-slate-400">{new Date(entry.timestamp).toLocaleString()}</p>
                  {entry.note && <p className="mt-1 text-slate-600">{entry.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Phase 16 Milestone 8 — the Interview section: readiness (reused, never fabricated), eligibility (deterministic, candidate-interview.ts), links into the protected Interview Preparation / Mock Interview architecture (server-derived resumeId/jdMatchId only), and interview feedback (reuses the existing free-form notes mechanism, category "Interview" — no new schema). */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Interview</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Interview Readiness</p>
              <p className="mt-1 text-sm text-slate-700">
                Status: <span className="font-semibold">{interviewReadinessView.readinessStatus}</span>
                {interviewReadinessView.readinessScore !== null && ` (${interviewReadinessView.readinessScore}/100)`}
              </p>
              <p className="text-sm text-slate-700">Technical readiness: {interviewReadinessView.technicalReadiness ?? "Not available"}</p>
              <p className="text-sm text-slate-700">Role/JD alignment: {interviewReadinessView.roleAlignment ?? "Not available"}</p>
              <p className="text-sm text-slate-700">
                Candidate Fit: {interviewReadinessView.candidateFitScore}/100 ({interviewReadinessView.candidateFitLevel})
              </p>
              <p className="text-sm text-slate-700">ATS Score: {interviewReadinessView.atsScore ?? "Not available"}</p>
              <p className="text-sm text-slate-700">JD Match: {interviewReadinessView.jdMatch !== null ? `${interviewReadinessView.jdMatch}%` : "Not available"}</p>
              <p className="mt-2 text-xs font-semibold uppercase text-amber-700">Missing Skills</p>
              <p className="text-sm text-slate-700">{interviewReadinessView.missingSkills.join(", ") || "None identified"}</p>
              <p className="mt-2 text-xs font-semibold uppercase text-blue-700">Recommended Interview Areas</p>
              {interviewReadinessView.recommendedInterviewAreas.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700" aria-label="Recommended interview areas">
                  {interviewReadinessView.recommendedInterviewAreas.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">Not enough evidence yet.</p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Eligibility: <span className={interviewEligibility.eligible ? "text-green-700" : "text-slate-600"}>{interviewEligibility.eligible ? "Eligible for Interview" : "Not Yet Eligible"}</span>
              </p>
              {interviewEligibility.reasons.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700" aria-label="Eligibility reasons">
                  {interviewEligibility.reasons.map((reason) => (
                    <li key={reason}>✓ {reason}</li>
                  ))}
                </ul>
              )}
              {interviewEligibility.warnings.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-sm text-amber-700" aria-label="Eligibility warnings">
                  {interviewEligibility.warnings.map((warning) => (
                    <li key={warning}>⚠ {warning}</li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {interviewLink?.available ? (
                  <>
                    <Link
                      href={`/interview-preparation?resumeId=${interviewLink.resumeId}&jdMatchId=${interviewLink.jdMatchId}`}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Open Interview Preparation
                    </Link>
                    <Link
                      href={`/mock-interview?resumeId=${interviewLink.resumeId}&jdMatchId=${interviewLink.jdMatchId}`}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Start Mock Interview
                    </Link>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">
                    Interview Preparation / Mock Interview links aren&apos;t available yet — match this candidate against a job (or re-match, if the link has expired) to enable them.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Log Interview Feedback</p>
            <p className="mb-2 text-xs text-slate-400">Fill in whichever fields apply — saved as one Interview-category note. None are required.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["technical", "Technical feedback"],
                  ["communication", "Communication feedback"],
                  ["roleFit", "Role fit feedback"],
                  ["strengths", "Strengths"],
                  ["concerns", "Concerns"],
                  ["recommendation", "Recommendation"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1 block text-xs text-slate-500" htmlFor={`interview-feedback-${key}`}>
                    {label}
                  </label>
                  <input
                    id={`interview-feedback-${key}`}
                    value={feedbackFields[key]}
                    onChange={(e) => setFeedbackFields((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleLogInterviewFeedback}
              disabled={busy === "interview-feedback"}
              className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy === "interview-feedback" ? "Saving..." : "Log Interview Feedback"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Scores</h3>
            <p className="text-sm text-slate-700">Resume Score: {summary.scores.resumeScore ?? "Not Evaluated"}</p>
            <p className="text-sm text-slate-700">ATS Score: {summary.scores.atsScore ?? "Not Evaluated"}</p>
            <p className="text-sm text-slate-700">JD Match: {summary.scores.jdMatch !== null ? `${summary.scores.jdMatch}%` : "Not Evaluated"}</p>
            <p className="text-sm text-slate-700">
              Candidate Fit: {summary.fitScore}/100 (<span aria-label={`Fit level ${summary.fitLevel}`}>{summary.fitLevel}</span>)
            </p>
            <p className="text-sm text-slate-700">Interview Readiness: {summary.scores.interviewReadiness ?? "Not Evaluated"}</p>
            <p className="mt-2 text-sm font-semibold text-slate-800">{recruiterSummary.recommendedAction}</p>
            <p className="mt-1 text-xs text-slate-400">
              {record.evaluatedAt ? `Last evaluated ${new Date(record.evaluatedAt).toLocaleString()}` : "Never evaluated against a job"}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={matchJobId}
                onChange={(e) => setMatchJobId(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                aria-label="Job to match against"
              >
                <option value="">Choose a job...</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </select>
              <button
                onClick={handleMatchJd}
                disabled={busy === "match" || !matchJobId}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === "match" ? "Matching..." : "Match Against Job"}
              </button>
              {record.jobId && (
                <button
                  onClick={handleReEvaluate}
                  disabled={busy === "evaluate"}
                  aria-label="Re-evaluate this candidate against their currently attached job"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === "evaluate" ? "Re-evaluating..." : "Re-evaluate Candidate"}
                </button>
              )}
              <button
                onClick={handleGenerateReadiness}
                disabled={busy === "readiness"}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === "readiness" ? "Generating..." : "Generate Interview Readiness"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Recruiter Fields</h3>
            <label className="mb-1 block text-xs text-slate-500">Notice Period</label>
            <input
              value={noticePeriod}
              onChange={(e) => setNoticePeriod(e.target.value)}
              className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <label className="mb-1 block text-xs text-slate-500">Expected Salary</label>
            <input
              value={expectedSalary}
              onChange={(e) => setExpectedSalary(e.target.value)}
              className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleSaveFields}
              disabled={busy === "fields"}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>

        {resume.summary && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Professional Summary</h3>
            <p className="text-sm text-slate-700">{resume.summary}</p>
          </div>
        )}

        {resume.workExperience.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Experience Timeline</h3>
            <div className="space-y-3">
              {resume.workExperience.map((job, index) => (
                <div key={index} className="border-l-2 border-blue-200 pl-4">
                  <p className="text-sm font-semibold text-slate-800">
                    {job.title} — {job.company}
                    {job.isCurrent ? " (Current)" : ""}
                  </p>
                  <p className="text-xs text-slate-400">
                    {job.startDate ?? "?"} - {job.isCurrent ? "Present" : job.endDate ?? "?"}
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-sm text-slate-600">
                    {job.description.map((bullet, bulletIndex) => (
                      <li key={bulletIndex}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {resume.education.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Education</h3>
              {resume.education.map((edu, index) => (
                <p key={index} className="text-sm text-slate-700">
                  {edu.degree}, {edu.institution}
                </p>
              ))}
            </div>
          )}

          {resume.certifications.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Certifications</h3>
              {resume.certifications.map((cert, index) => (
                <p key={index} className="text-sm text-slate-700">
                  {cert.name}
                  {cert.issuer ? ` — ${cert.issuer}` : ""}
                </p>
              ))}
            </div>
          )}
        </div>

        {resume.projects.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Projects</h3>
            {resume.projects.map((project, index) => (
              <div key={index} className="mb-2">
                <p className="text-sm font-semibold text-slate-800">{project.name}</p>
                {project.description && <p className="text-sm text-slate-600">{project.description}</p>}
                {project.technologies.length > 0 && <p className="text-xs text-slate-400">{project.technologies.join(", ")}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Skills / Technology Stack</h3>
            <div className="flex flex-wrap gap-1.5">
              {[...resume.skills, ...resume.technicalSkills].map((skill, index) => (
                <span key={index} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {resume.achievements.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Achievements</h3>
              <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
                {resume.achievements.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {jdMatchResult ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">JD Match</h3>
            <p className="text-sm text-slate-700">Overall match: {jdMatchResult.overallMatch}% | ATS: {jdMatchResult.atsScore}</p>
            <p className="mt-1 text-sm text-slate-700">Matched skills: {jdMatchResult.matchedSkills.join(", ") || "none"}</p>
            <p className="mt-1 text-sm text-slate-700">Missing skills: {jdMatchResult.missingSkills.join(", ") || "none"}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">JD Match</h3>
            <p className="text-sm text-slate-400">Not Evaluated — attach this candidate to a job to see a match.</p>
          </div>
        )}

        {atsExplanation && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">ATS Score Breakdown</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {atsExplanation.map((category) => (
                <div key={category.key} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>{category.label}</span>
                    <span>{category.value}/100</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{category.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase 16 Milestone 1, §11 — deterministic, zero-LLM-call summary. Distinct from the "AI Insights" panel below (candidate-insights.ts, 1 LLM call) — this is always available immediately, at zero cost, and never fabricates a strength/gap not backed by real matched/missing-skill or score data. */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Deterministic Summary</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-green-700">Strengths</p>
              {recruiterSummary.strengths.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700" aria-label="Candidate strengths">
                  {recruiterSummary.strengths.map((item) => (
                    <li key={item}>✓ {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-slate-400">Not enough evidence yet.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-amber-700">Gaps</p>
              {recruiterSummary.gaps.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700" aria-label="Candidate gaps">
                  {recruiterSummary.gaps.map((item) => (
                    <li key={item}>⚠ {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-slate-400">No gaps identified from available data.</p>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase text-slate-500">
            <span>JD Match: {recruiterSummary.dataAvailability.jdMatch === "available" ? "Available" : "Not provided"}</span>
            <span>Certifications: {recruiterSummary.dataAvailability.certifications === "available" ? "Available" : "Not provided"}</span>
            <span>Projects: {recruiterSummary.dataAvailability.projects === "available" ? "Available" : "Not provided"}</span>
            <span>Education: {recruiterSummary.dataAvailability.education === "available" ? "Available" : "Not provided"}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase text-slate-500">AI Insights</h3>
            <button
              onClick={handleGenerateInsights}
              disabled={busy === "insights"}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "insights" ? "Generating..." : "Generate Insights"}
            </button>
          </div>

          {record.insights ? (
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Hiring recommendation:</span> {record.insights.hiringRecommendation.rating} —{" "}
                {record.insights.hiringRecommendation.explanation}
              </p>
              <p>
                <span className="font-semibold">Strengths:</span> {record.insights.strengths.join("; ") || "none"}
              </p>
              <p>
                <span className="font-semibold">Weaknesses:</span> {record.insights.weaknesses.join("; ") || "none"}
              </p>
              <p>
                <span className="font-semibold">Risk factors:</span> {record.insights.riskFactors.join("; ") || "none"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Not generated yet.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-xs font-bold uppercase text-slate-500">Notes</h3>

          <div className="mb-4 flex flex-wrap gap-2">
            <select value={noteCategory} onChange={(e) => setNoteCategory(e.target.value as NoteCategory)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {NOTE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note..."
              className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleAddNote}
              disabled={busy === "note"}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add Note
            </button>
          </div>

          {record.notes.length === 0 ? (
            <p className="text-sm text-slate-400">No notes yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {[...record.notes].reverse().map((note) => (
                <li key={note.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <span className="mr-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">{note.category}</span>
                  {note.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

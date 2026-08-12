import { ALLOWED_STATUS_TRANSITIONS, CandidateStatus, isValidStatusTransition } from "./candidate-schema";
import { CandidateFitLevel, CandidateProfile, CandidateSummary } from "./candidate-types";

// Phase 16 Milestone 8 — audited first: no eligibility/readiness-view
// engine already existed anywhere in the recruiter workspace or the
// interview-prep/mock-interview architecture (those packages answer
// "how prepared is this candidate for interview questions", never
// "should the recruiter move this candidate to interview"). Every
// function here is PURE and deterministic — no I/O, no LLM call, no
// new scoring — built entirely from the existing CandidateStatus
// transition graph (candidate-schema.ts, Milestone 7) and fields
// candidate-service.ts/candidate-score.ts/candidate-summary.ts already
// compute. Nothing here invents a threshold that doesn't already exist
// in this codebase (see READY_FOR_INTERVIEW_THRESHOLD below).

export const INTERVIEW_STATUS: CandidateStatus = "Interview Scheduled";

/**
 * Mirrors candidate-service.ts's `findReadyForInterview(recruiterId,
 * threshold = 60)` — the EXISTING chat-tool business rule for "ready
 * for interview" (resume.tool.ts's "who is ready for interview"
 * command, Phase 13). Reused here rather than inventing a new
 * threshold, per the milestone's own explicit instruction not to
 * fabricate score bands without an existing rule to back them.
 */
export const READY_FOR_INTERVIEW_THRESHOLD = 60;

/** A status can host an interview candidate if it already IS the interview status, or the existing transition graph already permits moving there directly. Never a second state machine — purely a read of ALLOWED_STATUS_TRANSITIONS. */
export function isInterviewEligibleStatus(status: CandidateStatus): boolean {
  return status === INTERVIEW_STATUS || isValidStatusTransition(status, INTERVIEW_STATUS);
}

export interface InterviewEligibility {
  eligible: boolean;
  reasons: string[];
  warnings: string[];
}

/**
 * `missingSkills` is optional and additive-only to `warnings` — it
 * never affects `eligible` (a missing skill is something to probe IN
 * the interview, not a reason to block scheduling one). Callers that
 * only need the eligible/interview-eligible count (e.g. analytics,
 * §9) can omit it entirely and avoid an extra query.
 */
export function buildInterviewEligibility(candidate: CandidateSummary, missingSkills: string[] = []): InterviewEligibility {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const statusOk = isInterviewEligibleStatus(candidate.status);
  if (statusOk) {
    reasons.push(
      candidate.status === INTERVIEW_STATUS
        ? "Candidate is already scheduled for interview."
        : `Status "${candidate.status}" allows moving to interview.`
    );
  } else {
    warnings.push(`Current status "${candidate.status}" does not allow moving directly to interview (allowed next steps: ${ALLOWED_STATUS_TRANSITIONS[candidate.status].join(", ") || "none"}).`);
  }

  if (candidate.evaluationStatus === "complete") {
    reasons.push("Candidate evaluation complete.");
  } else if (candidate.evaluationStatus === "stale") {
    warnings.push("Evaluation is stale — the attached job's JD changed since the last match.");
  } else {
    warnings.push("Candidate has not been evaluated against a job yet.");
  }

  if (candidate.scores.jdMatch !== null) {
    reasons.push(`JD Match available (${candidate.scores.jdMatch}%).`);
  } else {
    warnings.push("No JD match data available.");
  }

  reasons.push(`Candidate Fit: ${candidate.fitLevel} (${candidate.fitScore}/100).`);

  const trimmedMissing = missingSkills.map((skill) => skill.trim()).filter(Boolean);
  if (trimmedMissing.length > 0) {
    const shown = trimmedMissing.slice(0, 5).join(", ");
    warnings.push(`Missing skills: ${shown}${trimmedMissing.length > 5 ? ", …" : ""}.`);
  }

  const eligible = statusOk && candidate.evaluationStatus === "complete" && candidate.scores.jdMatch !== null;

  return { eligible, reasons, warnings };
}

export interface InterviewReadinessView {
  /** "Not Generated" | "Ready for Interview" | "Needs More Preparation" — never a fabricated quality tier; "Ready"/"Needs Preparation" only apply once a real readinessScore exists. */
  readinessStatus: string;
  /** The persisted overall interview-readiness number (candidate-service.ts's generateInterviewReadiness snapshot) — null until generated. */
  readinessScore: number | null;
  /** JD matcher's keyword/technical-skill coverage score — the closest existing real signal for "technical readiness"; null (shown as "Not available") when no JD match exists. */
  technicalReadiness: number | null;
  /** JD matcher's experienceScore — role/JD alignment on career trajectory, distinct from the overall JD Match percentage. */
  roleAlignment: number | null;
  candidateFitScore: number;
  candidateFitLevel: CandidateFitLevel;
  atsScore: number | null;
  jdMatch: number | null;
  missingSkills: string[];
  /** Reuses candidate-summary.ts's buildRecruiterSummary().gaps verbatim (Milestone 1's existing, deterministic, evidence-backed gap list) — never a new computation. */
  recommendedInterviewAreas: string[];
}

function readinessStatusLabel(readinessScore: number | null): string {
  if (readinessScore === null) return "Not Generated";
  return readinessScore >= READY_FOR_INTERVIEW_THRESHOLD ? "Ready for Interview" : "Needs More Preparation";
}

/** Pure re-composition of an already-fetched CandidateProfile (candidate-service.ts's getProfile()) — no new fetch, no new score. */
export function buildInterviewReadinessView(profile: CandidateProfile): InterviewReadinessView {
  const { summary, record, jdMatchResult, recruiterSummary } = profile;

  return {
    readinessStatus: readinessStatusLabel(record.interviewReadinessScore),
    readinessScore: record.interviewReadinessScore,
    technicalReadiness: jdMatchResult?.keywordScore ?? null,
    roleAlignment: jdMatchResult?.experienceScore ?? null,
    candidateFitScore: summary.fitScore,
    candidateFitLevel: summary.fitLevel,
    atsScore: summary.scores.atsScore,
    jdMatch: summary.scores.jdMatch,
    missingSkills: jdMatchResult?.missingSkills ?? [],
    recommendedInterviewAreas: recruiterSummary.gaps,
  };
}

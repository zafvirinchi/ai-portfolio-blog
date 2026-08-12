import { CandidateStatus } from "./candidate-schema";
import { RankedCandidate } from "./candidate-types";
import { RecruiterJobRecord } from "./recruiter-job-types";

// Non-schema wrapper types — mirrors recruiter-job-types.ts's role.
// Every field here is either a direct count/average over already-
// persisted CandidateSummary/RecruiterJobRecord data, or a pass-through
// of an existing engine's output (RankedCandidate). Nothing here is
// computed by an LLM.

export interface OverallAnalytics {
  totalJobs: number;
  totalCandidates: number;
  evaluatedCandidates: number;
  unevaluatedCandidates: number;
  staleCandidates: number;
  averageJdMatch: number | null;
  averageAtsScore: number | null;
  averageCandidateFit: number | null;
}

export interface FitDistribution {
  strongCount: number;
  goodCount: number;
  moderateCount: number;
  lowCount: number;
}

export interface EvaluationDistribution {
  notEvaluated: number;
  complete: number;
  stale: number;
}

/**
 * Phase 16 Milestone 7, §9 — deterministic percentages of the CURRENT
 * status snapshot relative to total candidates (statusDistribution's
 * "Shortlisted"/"Interview Scheduled"/"Hired" counts, already computed
 * — no new source data). Deliberately NOT a cohort/funnel conversion
 * rate (e.g. "of everyone ever shortlisted, what % reached interview")
 * — CandidateStatus is a single current value, not a history of every
 * stage a candidate passed through, so a true cohort rate would need
 * to scan every candidate's decisionHistory (Milestone 7's new
 * decision-history log) rather than the lightweight CandidateSummary
 * this module already works from; documented here as a possible
 * future enhancement rather than built speculatively now.
 */
export interface ConversionRates {
  shortlistRate: number | null;
  interviewRate: number | null;
  hireRate: number | null;
}

/**
 * Phase 16 Milestone 6, §2 — built ONLY from CandidateStatus/
 * EvaluationStatus/CandidateFitLevel values that already exist; no
 * invented transition. Stages are counted independently (each is its
 * own criterion over the same candidate pool), not strictly nested —
 * the underlying status/evaluation/fit fields are each independently
 * settable by the recruiter, so a strict funnel would misrepresent
 * real data (e.g. a recruiter can shortlist an unevaluated candidate;
 * forcing that candidate out of an earlier "not shortlisted yet" stage
 * would be fabricating an ordering the data doesn't support).
 */
export interface ScreeningFunnelStage {
  stage: "Imported" | "Evaluated" | "Strong/Good Fit" | "Shortlisted" | "Interview/Selected";
  count: number;
}

export interface JobAnalyticsEntry {
  jobId: string;
  title: string;
  company: string | null;
  candidateCount: number;
  evaluatedCount: number;
  averageJdMatch: number | null;
  averageAtsScore: number | null;
  averageCandidateFit: number | null;
  strongFitCount: number;
  goodFitCount: number;
  moderateFitCount: number;
  lowFitCount: number;
  staleCount: number;
}

export interface SkillGapEntry {
  skill: string;
  missingCount: number;
}

export type AttentionPriority = "HIGH" | "INFORMATIONAL";

export interface AttentionItem {
  candidateId: string;
  candidateName: string;
  jobId: string | null;
  priority: AttentionPriority;
  reason: string;
}

/**
 * Phase 16 Milestone 8, §9 — cohort metrics computed from
 * decision_history (Milestone 7's append-only status-change log), a
 * genuine step up from ConversionRates' current-snapshot percentages
 * (that type's own doc comment flagged this exact gap as a possible
 * future enhancement). Because decision_history only exists going
 * forward from Milestone 7, candidates whose status changes all
 * predate it will not retroactively appear in these cohorts — an
 * honest limitation of real data, not a fabricated number (documented
 * in the Milestone 8 report's Known Limitations).
 */
export interface InterviewFunnelMetrics {
  /** Candidates currently in "Interview Scheduled" — a direct read of statusDistribution, exposed here as a named convenience field. */
  interviewCandidates: number;
  /** Candidates NOT currently in "Interview Scheduled" but for whom buildInterviewEligibility() (candidate-interview.ts) returns eligible: true. */
  interviewEligibleCandidates: number;
  /** % of the "ever reached Shortlisted" cohort that also ever reached "Interview Scheduled". Null when the cohort is empty. */
  shortlistToInterviewRate: number | null;
  /** % of the "ever reached Interview Scheduled" cohort that is currently Hired. Null when the cohort is empty. */
  interviewToHireRate: number | null;
  /** Count of candidates who reached "Interview Scheduled" and are now Rejected. */
  rejectedAfterInterviewCount: number;
  /** Candidates currently Hired — a direct read of statusDistribution, exposed here as a named convenience field. */
  hireCount: number;
  /**
   * Phase 16 Milestone 9, §8 — the raw cohort size behind
   * shortlistToInterviewRate/interviewToHireRate's denominators: every
   * candidate who is currently "Interview Scheduled" OR whose
   * decision_history shows they were at some point — distinct from
   * `interviewCandidates` above, which only counts CURRENT status.
   */
  interviewedCohortCount: number;
  /** Phase 16 Milestone 9, §8 — the raw count behind interviewToHireRate's numerator: candidates who reached "Interview Scheduled" and are now Hired. */
  hiredAfterInterviewCount: number;
}

export interface RecruiterAnalytics {
  /** null = overall (all jobs); non-null = this one job only. */
  scope: { jobId: string | null; job: RecruiterJobRecord | null };
  overall: OverallAnalytics;
  fitDistribution: FitDistribution;
  evaluationDistribution: EvaluationDistribution;
  conversionRates: ConversionRates;
  interviewFunnel: InterviewFunnelMetrics;
  /** Every existing CandidateStatus, always present (0 if unused) — never a partial map. */
  statusDistribution: Record<CandidateStatus, number>;
  screeningFunnel: ScreeningFunnelStage[];
  /** Empty when scope.jobId is set — job-level rows are only meaningful in the overall (all-jobs) view. */
  jobAnalytics: JobAnalyticsEntry[];
  topCandidates: RankedCandidate[];
  /**
   * Phase 16 Milestone 6, §4 — only ever populated when scope.jobId is
   * set. Missing skills are relative to ONE job's JD; combining
   * different jobs' missing-skill lists into one aggregate would
   * conflate unrelated requirement sets (Job A wanting Docker and Job
   * B wanting Redis don't add up to a single "skill gap" signal) — so
   * the overall view deliberately leaves this empty rather than
   * fabricate a cross-job aggregate.
   */
  skillGaps: SkillGapEntry[];
  attentionQueue: AttentionItem[];
}

import { JdMatchResult } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import type { ScoreCategoryExplanation } from "../resume-versions/dynamic/ats-explainability";
import { CandidateInsights, CandidateStatus, CandidateTag, NoteEntry } from "./candidate-schema";

// Non-schema wrapper types — mirrors resume/resume-types.ts's and
// jd-types.ts's role relative to their own *-schema.ts files.

export interface CandidateImportFile {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
}

/** Phase 16 Milestone 7, §7 — one entry per status change, appended automatically by CandidateService.updateStatus()/bulkUpdateStatus(). recruiterId is always server-derived (requireRecruiterId()), never accepted from a request body. Never stores resume/JD text, prompts, or tokens — only status values and an optional short recruiter note. */
export interface DecisionHistoryEntry {
  id: string;
  recruiterId: string;
  previousStatus: CandidateStatus;
  newStatus: CandidateStatus;
  note: string | null;
  timestamp: string;
}

/**
 * Phase 16 Milestone 3 — persisted (recruiter_candidates table), a
 * SNAPSHOT of resumeService's already-computed output rather than a
 * live reference into it (the same snapshot-not-reference precedent
 * resume_versions.resume_data already established) — so a candidate
 * survives past resumeService's 2h ephemeral TTL and across server
 * restarts. resumeId is kept only as a best-effort pointer for the
 * "Rewrite this resume" deep link; it may be stale/expired for any
 * candidate older than that window, same as it already was pre-
 * persistence. jdMatchResult/interviewReadinessScore/insights are
 * likewise snapshots of already-computed engine output, never
 * re-derived from an ephemeral id.
 */
export interface CandidateRecord {
  candidateId: string;
  /** The auth.users id of the recruiter who imported this candidate; server-derived only, never client-supplied. Every read/write path in CandidateService checks this before returning or mutating a record. */
  recruiterId: string;
  /** The recruiter_jobs row this candidate is currently attached to, if any — null until explicitly matched against a job. */
  jobId: string | null;
  filename: string;
  /** Best-effort pointer into resumeService's ephemeral store — see the class doc comment above. */
  resumeId: string | null;
  resumeData: Resume;
  atsScore: number | null;
  jdMatchResult: JdMatchResult | null;
  interviewReadinessScore: number | null;

  status: CandidateStatus;
  tags: CandidateTag[];
  notes: NoteEntry[];
  /** Phase 16 Milestone 7 — append-only log of status changes; see DecisionHistoryEntry's doc comment. */
  decisionHistory: DecisionHistoryEntry[];

  noticePeriod: string | null;
  expectedSalary: string | null;

  insights: CandidateInsights | null;

  /** Phase 16 Milestone 4 — set only when jd_match_result is actually (re)computed; compared against the attached job's updatedAt to detect a stale evaluation. Null until matched at least once. */
  evaluatedAt: string | null;

  importedAt: string;
  updatedAt: string;
}

/** Raw `recruiter_candidates` row shape, snake_case — exactly as stored/read via supabaseAdmin. */
export interface CandidateRow {
  id: string;
  recruiter_id: string;
  job_id: string | null;
  filename: string;
  resume_id: string | null;
  resume_data: Resume;
  ats_score: number | null;
  jd_match_result: JdMatchResult | null;
  interview_readiness_score: number | null;
  insights: CandidateInsights | null;
  status: CandidateStatus;
  tags: CandidateTag[];
  notes: NoteEntry[];
  decision_history: DecisionHistoryEntry[];
  notice_period: string | null;
  expected_salary: string | null;
  evaluated_at: string | null;
  created_at: string;
  updated_at: string;
}

// Single-candidate score assembly (candidate-score.ts) — every field is
// `null` when its real source data isn't available yet, never guessed.
export interface CandidateScoreBreakdown {
  resumeScore: number | null;
  atsScore: number | null;
  jdMatch: number | null;
  experienceScore: number | null;
  skillsScore: number | null;
  projectsScore: number | null;
  leadershipScore: number | null;
  communicationScore: number | null;
  cloudScore: number | null;
  aiScore: number | null;
  devOpsScore: number | null;
  certificationScore: number | null;
  interviewReadiness: number | null;
  overallScore: number | null;
}

// Phase 16 Milestone 4, §15/§20 — derived (never stored) per-candidate
// evaluation state. "not_evaluated": no job attached yet, or never
// matched. "stale": matched, but the attached job's JD has changed
// since (job.updatedAt > candidate.evaluatedAt). "complete": matched
// and up to date. There is no persisted "failed" state — a failed
// match attempt throws synchronously back to the caller without
// touching the candidate row (§15/§16 — never invent a score, never
// silently lose a prior successful result), so "failed" is a
// transient, request-level UI state, not a stored property.
export type EvaluationStatus = "not_evaluated" | "complete" | "stale";

// Table/dashboard-ready merged view — the shape returned by list().
export interface CandidateSummary {
  candidateId: string;
  /** Phase 16 Milestone 4 — lets the UI group/filter candidates by job client-side without a new endpoint. */
  jobId: string | null;
  name: string;
  /** Phase 16 Milestone 9 — resume.contact fields already read into memory by toSummary(); surfaced here (zero extra cost, no new query) so exports don't need a full profile fetch per candidate. */
  email: string | null;
  phone: string | null;
  currentRole: string | null;
  currentCompany: string | null;
  experienceYears: number | null;
  location: string | null;
  noticePeriod: string | null;
  expectedSalary: string | null;
  status: CandidateStatus;
  tags: CandidateTag[];
  scores: CandidateScoreBreakdown;
  importedAt: string;
  /** Phase 16 Milestone 5 — for the screening list's "Last Evaluated" column; null until first matched. */
  evaluatedAt: string | null;
  /** Phase 16 Milestone 4 — Milestone 1's own Candidate Fit engine (computeRankingScore + classifyCandidateFitLevel), reused as-is, exposed at the individual-candidate level (not just inside a ranking list). */
  fitScore: number;
  fitLevel: CandidateFitLevel;
  /** Phase 16 Milestone 5 — the same deterministic recommendation candidate-summary.ts's buildRecruiterSummary() already computes, surfaced here too so list/CSV views don't need a full profile fetch. Informational only. */
  recommendedAction: string;
  evaluationStatus: EvaluationStatus;
}

// Full profile-page view — the shape returned by getProfile().
export interface CandidateProfile {
  summary: CandidateSummary;
  record: CandidateRecord;
  resume: Resume;
  jdMatchResult: JdMatchResult | null;
  /** Phase 16 Milestone 1, §11 — deterministic, zero-LLM-call summary; distinct from record.insights (the existing LLM-generated CandidateInsights), never a replacement for it. */
  recruiterSummary: RecruiterSummary;
  /** Phase 16 Milestone 4, §9 — reuses resume-versions/dynamic/ats-explainability.ts's explainJdAtsCategories() (Phase 15's existing, deterministic per-category explanation engine) against this candidate's JD-match category scores. Null when no JD match exists yet. */
  atsExplanation: ScoreCategoryExplanation[] | null;
}

export interface CandidateImportResult {
  imported: CandidateSummary[];
  /** Phase 16 Milestone 4, §7 — same recruiter + same job + same resume email as an already-imported candidate; the existing candidate is returned here instead of creating a duplicate row. */
  duplicates: { filename: string; existingCandidateId: string }[];
  failed: { filename: string; error: string }[];
}

export interface DashboardSummary {
  totalCandidates: number;
  shortlisted: number;
  interviewScheduled: number;
  rejected: number;
  pendingReview: number;
  averageAtsScore: number | null;
  averageJdMatch: number | null;
  averageExperience: number | null;
  skillDistribution: { skill: string; count: number }[];
  topTechnologies: { technology: string; count: number }[];
  recentUploads: CandidateSummary[];
  /** Phase 16 Milestone 3 — replaces the old single-boolean "is there an active JD" flag now that a recruiter can own many persistent jobs; total job count regardless of status. */
  jobCount: number;
}

// Phase 16 Milestone 1, §8 — see candidate-ranking.ts's classifyCandidateFitLevel() for the documented threshold choice.
export type CandidateFitLevel = "STRONG" | "GOOD" | "MODERATE" | "LOW";

// Phase 16 Milestone 1, §11 — see candidate-summary.ts's buildRecruiterSummary(). Defined here (the leaf types file) rather than in candidate-summary.ts itself so CandidateProfile below can reference it without a circular import.
export type DataAvailability = "available" | "not_provided";

export interface RecruiterSummary {
  strengths: string[];
  gaps: string[];
  dataAvailability: {
    jdMatch: DataAvailability;
    certifications: DataAvailability;
    projects: DataAvailability;
    education: DataAvailability;
  };
  /** Phase 16 Milestone 4, §12 — a fixed, deterministic recommendation keyed by fit level (candidate-summary.ts's recommendRecruiterAction()). Never LLM-generated. */
  recommendedAction: string;
}

export interface RankedCandidate {
  candidateId: string;
  rank: number;
  rankingScore: number;
  level: CandidateFitLevel;
  summary: CandidateSummary;
}

export const COMPARISON_METRICS = [
  "Experience",
  "ATS",
  "JD Match",
  "Skills",
  "Projects",
  "Leadership",
  "Communication",
  "Cloud",
  "AI",
  "DevOps",
  "Overall Score",
] as const;
export type ComparisonMetric = (typeof COMPARISON_METRICS)[number];

export interface ComparisonRow {
  metric: ComparisonMetric;
  values: Record<string, number | null>;
}

export interface ComparisonResult {
  candidateIds: string[];
  candidates: CandidateSummary[];
  table: ComparisonRow[];
  recommendation: string;
  rankingRationale: string;
  perCandidateNotes: { candidateId: string; keyDifferentiators: string[] }[];
}

export interface TopCandidatesRecommendation {
  candidateIds: string[];
  candidates: CandidateSummary[];
  summary: string;
}

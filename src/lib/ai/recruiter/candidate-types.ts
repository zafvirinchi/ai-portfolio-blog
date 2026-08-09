import { JdMatchResult } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { CandidateInsights, CandidateStatus, CandidateTag, NoteEntry } from "./candidate-schema";

// Non-schema wrapper types — mirrors resume/resume-types.ts's and
// jd-types.ts's role relative to their own *-schema.ts files.

export interface CandidateImportFile {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
}

// The thin overlay stored per candidate — resumeId/jdMatchId/prepId are
// references into resumeService/jdMatchService/prepService, never copies
// (see plan design decision 1). Everything display-worthy is derived
// live from those records via candidate-service.ts's toSummary()/
// getProfile().
export interface CandidateRecord {
  candidateId: string;
  resumeId: string;
  jdMatchId: string | null;
  prepId: string | null;

  status: CandidateStatus;
  tags: CandidateTag[];
  notes: NoteEntry[];

  noticePeriod: string | null;
  expectedSalary: string | null;

  insights: CandidateInsights | null;
  rankingScore: number | null;

  importedAt: string;
  updatedAt: string;
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

// Table/dashboard-ready merged view — the shape returned by list().
export interface CandidateSummary {
  candidateId: string;
  name: string;
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
}

// Full profile-page view — the shape returned by getProfile().
export interface CandidateProfile {
  summary: CandidateSummary;
  record: CandidateRecord;
  resume: Resume;
  jdMatchResult: JdMatchResult | null;
}

export interface CandidateImportResult {
  imported: CandidateSummary[];
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
  activeJobDescriptionSet: boolean;
}

export interface RankedCandidate {
  candidateId: string;
  rank: number;
  rankingScore: number;
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

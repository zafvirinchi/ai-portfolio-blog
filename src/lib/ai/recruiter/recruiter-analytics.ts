import { buildInterviewEligibility, INTERVIEW_STATUS } from "./candidate-interview";
import { CANDIDATE_STATUSES, CandidateStatus } from "./candidate-schema";
import { CandidateSummary, DecisionHistoryEntry, RankedCandidate } from "./candidate-types";
import { RecruiterJobRecord } from "./recruiter-job-types";
import {
  AttentionItem,
  ConversionRates,
  EvaluationDistribution,
  FitDistribution,
  InterviewFunnelMetrics,
  JobAnalyticsEntry,
  OverallAnalytics,
  RecruiterAnalytics,
  ScreeningFunnelStage,
  SkillGapEntry,
} from "./recruiter-analytics-types";

// Phase 16 Milestone 6 — every function here is PURE and deterministic:
// no I/O, no LLM call, no new scoring. Each takes data the existing
// engines (CandidateService/RecruiterJobService/candidate-ranking.ts)
// already computed and only counts/averages/groups it. The orchestrator
// that fetches the input data lives in recruiter-analytics-service.ts.

function average(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.round(present.reduce((sum, value) => sum + value, 0) / present.length) : null;
}

export function computeOverallAnalytics(candidates: CandidateSummary[], jobs: RecruiterJobRecord[]): OverallAnalytics {
  const evaluated = candidates.filter((c) => c.evaluationStatus !== "not_evaluated");
  const stale = candidates.filter((c) => c.evaluationStatus === "stale");

  return {
    totalJobs: jobs.length,
    totalCandidates: candidates.length,
    evaluatedCandidates: evaluated.length,
    unevaluatedCandidates: candidates.length - evaluated.length,
    staleCandidates: stale.length,
    averageJdMatch: average(candidates.map((c) => c.scores.jdMatch)),
    averageAtsScore: average(candidates.map((c) => c.scores.atsScore)),
    averageCandidateFit: average(candidates.map((c) => c.fitScore)),
  };
}

export function computeFitDistribution(candidates: CandidateSummary[]): FitDistribution {
  return {
    strongCount: candidates.filter((c) => c.fitLevel === "STRONG").length,
    goodCount: candidates.filter((c) => c.fitLevel === "GOOD").length,
    moderateCount: candidates.filter((c) => c.fitLevel === "MODERATE").length,
    lowCount: candidates.filter((c) => c.fitLevel === "LOW").length,
  };
}

export function computeEvaluationDistribution(candidates: CandidateSummary[]): EvaluationDistribution {
  return {
    notEvaluated: candidates.filter((c) => c.evaluationStatus === "not_evaluated").length,
    complete: candidates.filter((c) => c.evaluationStatus === "complete").length,
    stale: candidates.filter((c) => c.evaluationStatus === "stale").length,
  };
}

/** Every existing CandidateStatus is present in the result, even at 0 — never a partial map that silently omits an unused status. */
export function computeStatusDistribution(candidates: CandidateSummary[]): Record<CandidateStatus, number> {
  const distribution = Object.fromEntries(CANDIDATE_STATUSES.map((status) => [status, 0])) as Record<CandidateStatus, number>;

  for (const candidate of candidates) {
    distribution[candidate.status] += 1;
  }

  return distribution;
}

/** See ConversionRates' doc comment (recruiter-analytics-types.ts) for why these are current-snapshot percentages, not cohort conversion rates. Null (never 0%) when there are no candidates to divide by. */
export function computeConversionRates(statusDistribution: Record<CandidateStatus, number>, totalCandidates: number): ConversionRates {
  const rate = (count: number): number | null => (totalCandidates > 0 ? Math.round((count / totalCandidates) * 100) : null);

  return {
    shortlistRate: rate(statusDistribution["Shortlisted"]),
    interviewRate: rate(statusDistribution["Interview Scheduled"]),
    hireRate: rate(statusDistribution["Hired"]),
  };
}

/** See recruiter-analytics-types.ts's ScreeningFunnelStage doc comment for why stages are independently counted rather than strictly nested. */
export function computeScreeningFunnel(candidates: CandidateSummary[]): ScreeningFunnelStage[] {
  return [
    { stage: "Imported", count: candidates.length },
    { stage: "Evaluated", count: candidates.filter((c) => c.evaluationStatus !== "not_evaluated").length },
    { stage: "Strong/Good Fit", count: candidates.filter((c) => c.fitLevel === "STRONG" || c.fitLevel === "GOOD").length },
    { stage: "Shortlisted", count: candidates.filter((c) => c.status === "Shortlisted").length },
    {
      stage: "Interview/Selected",
      count: candidates.filter((c) => c.status === "Interview Scheduled" || c.status === "Offer" || c.status === "Hired").length,
    },
  ];
}

/** Groups already-fetched candidates by jobId — zero extra queries. A job with no candidates gets an all-zero/null entry (§12's "job with zero candidates" case), not an omitted row. */
export function computeJobAnalytics(jobs: RecruiterJobRecord[], candidates: CandidateSummary[]): JobAnalyticsEntry[] {
  return jobs.map((job) => {
    const jobCandidates = candidates.filter((c) => c.jobId === job.id);
    const evaluated = jobCandidates.filter((c) => c.evaluationStatus !== "not_evaluated");

    return {
      jobId: job.id,
      title: job.title,
      company: job.company,
      candidateCount: jobCandidates.length,
      evaluatedCount: evaluated.length,
      averageJdMatch: average(jobCandidates.map((c) => c.scores.jdMatch)),
      averageAtsScore: average(jobCandidates.map((c) => c.scores.atsScore)),
      averageCandidateFit: average(jobCandidates.map((c) => c.fitScore)),
      strongFitCount: jobCandidates.filter((c) => c.fitLevel === "STRONG").length,
      goodFitCount: jobCandidates.filter((c) => c.fitLevel === "GOOD").length,
      moderateFitCount: jobCandidates.filter((c) => c.fitLevel === "MODERATE").length,
      lowFitCount: jobCandidates.filter((c) => c.fitLevel === "LOW").length,
      staleCount: jobCandidates.filter((c) => c.evaluationStatus === "stale").length,
    };
  });
}

/**
 * §4 — aggregates JdMatchResult.missingSkills (the existing JD
 * matcher's own output, never recomputed) across a job's candidates.
 * Grouping is normalized (trimmed + lowercased) so "Docker"/"docker"/
 * " Docker " count as one skill, displayed using whichever original
 * casing was seen first — never fabricates a skill that wasn't
 * actually in some candidate's missingSkills list.
 */
export function computeSkillGaps(missingSkillsByCandidate: { candidateId: string; missingSkills: string[] }[]): SkillGapEntry[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const { missingSkills } of missingSkillsByCandidate) {
    for (const rawSkill of missingSkills) {
      const skill = rawSkill.trim();
      if (!skill) continue;

      const key = skill.toLowerCase();
      const existing = counts.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { label: skill, count: 1 });
      }
    }
  }

  return [...counts.values()].sort((a, b) => b.count - a.count).map(({ label, count }) => ({ skill: label, missingCount: count }));
}

function everReachedStatus(history: DecisionHistoryEntry[], status: CandidateStatus): boolean {
  return history.some((entry) => entry.newStatus === status);
}

/**
 * Phase 16 Milestone 8, §9 — see InterviewFunnelMetrics' doc comment
 * (recruiter-analytics-types.ts) for why these are cohort metrics
 * (built from decision_history) rather than current-snapshot
 * percentages like computeConversionRates() above. `histories` is
 * fetched once by the orchestrator (candidateService.listDecisionHistories,
 * a single recruiter-scoped query) — never one query per candidate.
 */
export function computeInterviewFunnelMetrics(
  candidates: CandidateSummary[],
  histories: { candidateId: string; decisionHistory: DecisionHistoryEntry[] }[]
): InterviewFunnelMetrics {
  const historyByCandidate = new Map(histories.map((h) => [h.candidateId, h.decisionHistory]));
  const rate = (numerator: number, denominator: number): number | null => (denominator > 0 ? Math.round((numerator / denominator) * 100) : null);

  let interviewCandidates = 0;
  let interviewEligibleCandidates = 0;
  let hireCount = 0;
  let shortlistedCohort = 0;
  let shortlistReachedInterview = 0;
  let interviewedCohort = 0;
  let interviewedThenRejected = 0;
  let interviewedThenHired = 0;

  for (const candidate of candidates) {
    const history = historyByCandidate.get(candidate.candidateId) ?? [];
    const reachedInterview = candidate.status === INTERVIEW_STATUS || everReachedStatus(history, INTERVIEW_STATUS);
    const wasShortlisted = candidate.status === "Shortlisted" || everReachedStatus(history, "Shortlisted");

    if (candidate.status === INTERVIEW_STATUS) interviewCandidates += 1;
    if (candidate.status === "Hired") hireCount += 1;
    if (candidate.status !== INTERVIEW_STATUS && buildInterviewEligibility(candidate).eligible) interviewEligibleCandidates += 1;

    if (wasShortlisted) {
      shortlistedCohort += 1;
      if (reachedInterview) shortlistReachedInterview += 1;
    }

    if (reachedInterview) {
      interviewedCohort += 1;
      if (candidate.status === "Rejected") interviewedThenRejected += 1;
      if (candidate.status === "Hired") interviewedThenHired += 1;
    }
  }

  return {
    interviewCandidates,
    interviewEligibleCandidates,
    shortlistToInterviewRate: rate(shortlistReachedInterview, shortlistedCohort),
    interviewToHireRate: rate(interviewedThenHired, interviewedCohort),
    rejectedAfterInterviewCount: interviewedThenRejected,
    hireCount,
    interviewedCohortCount: interviewedCohort,
    hiredAfterInterviewCount: interviewedThenHired,
  };
}

const HIGH_JD_MATCH_THRESHOLD = 80;
const LOW_ATS_THRESHOLD = 60;
const HIGH_ATS_THRESHOLD = 80;
const LOW_JD_MATCH_THRESHOLD = 60;
const RECENTLY_EVALUATED_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * §3 — one reason per candidate, first matching rule wins (checked in
 * priority order below), so the queue stays a focused action list
 * rather than every candidate appearing multiple times. Every reason
 * is derived from a real, already-persisted field — no LLM, no
 * invented explanation. A candidate matching no rule (e.g. a
 * MODERATE/LOW-fit candidate with a non-pending status and consistent
 * scores) is simply omitted — not everyone needs recruiter attention.
 */
export function computeAttentionQueue(candidates: CandidateSummary[], now: Date = new Date()): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const candidate of candidates) {
    const base = { candidateId: candidate.candidateId, candidateName: candidate.name, jobId: candidate.jobId };
    const { atsScore, jdMatch } = candidate.scores;

    if (candidate.evaluationStatus === "stale") {
      items.push({ ...base, priority: "HIGH", reason: "Stale evaluation — the attached job's JD changed since this candidate was last matched." });
      continue;
    }

    if (candidate.evaluationStatus === "not_evaluated" && candidate.jobId) {
      items.push({ ...base, priority: "HIGH", reason: "Attached to a job but not yet evaluated against it." });
      continue;
    }

    if (jdMatch !== null && atsScore !== null && jdMatch >= HIGH_JD_MATCH_THRESHOLD && atsScore < LOW_ATS_THRESHOLD) {
      items.push({
        ...base,
        priority: "HIGH",
        reason: `High JD match (${jdMatch}%) but low ATS score (${atsScore}) — possible resume formatting or keyword-density issue.`,
      });
      continue;
    }

    if (atsScore !== null && jdMatch !== null && atsScore >= HIGH_ATS_THRESHOLD && jdMatch < LOW_JD_MATCH_THRESHOLD) {
      items.push({
        ...base,
        priority: "HIGH",
        reason: `High ATS score (${atsScore}) but low JD match (${jdMatch}%) — may not fit this specific role.`,
      });
      continue;
    }

    if (candidate.status === "Pending Review" && candidate.evaluationStatus === "complete") {
      items.push({ ...base, priority: "HIGH", reason: "Evaluated and awaiting a recruiter decision." });
      continue;
    }

    if (candidate.fitLevel === "STRONG") {
      items.push({ ...base, priority: "INFORMATIONAL", reason: "Strong candidate fit." });
      continue;
    }

    if (candidate.fitLevel === "GOOD") {
      items.push({ ...base, priority: "INFORMATIONAL", reason: "Good candidate fit." });
      continue;
    }

    if (candidate.evaluatedAt && now.getTime() - new Date(candidate.evaluatedAt).getTime() < RECENTLY_EVALUATED_WINDOW_MS) {
      items.push({ ...base, priority: "INFORMATIONAL", reason: "Recently evaluated." });
    }
  }

  return items;
}

export function buildRecruiterAnalytics(params: {
  scope: { jobId: string | null; job: RecruiterJobRecord | null };
  candidates: CandidateSummary[];
  jobs: RecruiterJobRecord[];
  ranked: RankedCandidate[];
  missingSkillsByCandidate: { candidateId: string; missingSkills: string[] }[];
  decisionHistories: { candidateId: string; decisionHistory: DecisionHistoryEntry[] }[];
}): RecruiterAnalytics {
  const { scope, candidates, jobs, ranked, missingSkillsByCandidate, decisionHistories } = params;
  const statusDistribution = computeStatusDistribution(candidates);

  return {
    scope,
    overall: computeOverallAnalytics(candidates, jobs),
    fitDistribution: computeFitDistribution(candidates),
    evaluationDistribution: computeEvaluationDistribution(candidates),
    conversionRates: computeConversionRates(statusDistribution, candidates.length),
    interviewFunnel: computeInterviewFunnelMetrics(candidates, decisionHistories),
    statusDistribution,
    screeningFunnel: computeScreeningFunnel(candidates),
    jobAnalytics: scope.jobId ? [] : computeJobAnalytics(jobs, candidates),
    topCandidates: ranked.slice(0, 5),
    skillGaps: scope.jobId ? computeSkillGaps(missingSkillsByCandidate) : [],
    attentionQueue: computeAttentionQueue(candidates),
  };
}

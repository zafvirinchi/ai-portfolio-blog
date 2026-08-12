import { rankCandidates } from "./candidate-ranking";
import { candidateService } from "./candidate-service";
import { renderHiringDecisionReportCsv, renderHiringDecisionReportExcel } from "./candidate-export";
import { buildRecruiterAnalytics } from "./recruiter-analytics";
import { RecruiterAnalytics } from "./recruiter-analytics-types";
import { recruiterJobService } from "./recruiter-job-service";

// Phase 16 Milestone 6 — the one I/O-performing orchestrator for
// analytics. Never queries the database directly: every fetch here
// goes through the existing, already-ownership-scoped
// CandidateService/RecruiterJobService methods, then hands the results
// to recruiter-analytics.ts's pure functions. jobId (when supplied) is
// ownership-verified via recruiterJobService.getJob() BEFORE anything
// else runs — the same RecruiterJobNotFoundError/404 convention every
// other recruiter route already uses, so a foreign jobId is
// indistinguishable from a nonexistent one.
export async function getRecruiterAnalytics(recruiterId: string, jobId?: string): Promise<RecruiterAnalytics> {
  const job = jobId ? await recruiterJobService.getJob(recruiterId, jobId) : null;

  const [candidates, jobs, missingSkillsByCandidate, decisionHistories] = await Promise.all([
    candidateService.list(recruiterId, { jobId }),
    // The overall (all-jobs) job-analytics breakdown needs every job
    // regardless of scope; when scoped to one job, computeJobAnalytics()
    // is skipped entirely (see buildRecruiterAnalytics), so this list is
    // simply unused in that branch rather than fetched twice.
    recruiterJobService.listJobs(recruiterId),
    jobId ? candidateService.listMissingSkills(recruiterId, jobId) : Promise.resolve([]),
    // Phase 16 Milestone 8, §9 — the interview funnel's cohort metrics.
    candidateService.listDecisionHistories(recruiterId, jobId),
  ]);

  // Phase 16 Milestone 10, §13 — audited: this used to also call
  // candidateService.computeRanking(recruiterId, { jobId }) here, which
  // internally re-runs list() with the SAME arguments — a fully
  // redundant duplicate fetch of both the candidate list and the jobs
  // list on every analytics request. rankCandidates() is the exact same
  // pure function computeRanking() calls internally; applying it
  // directly to the `candidates` already fetched above produces an
  // IDENTICAL ranking with zero behavior change, just without the
  // repeated query.
  const ranked = rankCandidates(candidates);

  return buildRecruiterAnalytics({
    scope: { jobId: jobId ?? null, job },
    candidates,
    jobs,
    ranked,
    missingSkillsByCandidate,
    decisionHistories,
  });
}

/**
 * Phase 16 Milestone 9, §4 — the Hiring Decision Report. Purely a new
 * RENDERING of getRecruiterAnalytics()'s already-computed output
 * (Milestones 6/7/8's existing analytics engine) — no metric here is
 * recomputed by a second implementation, and no LLM call is made.
 */
export async function exportHiringDecisionReportCsv(recruiterId: string, jobId?: string): Promise<string> {
  return renderHiringDecisionReportCsv(await getRecruiterAnalytics(recruiterId, jobId));
}

export async function exportHiringDecisionReportExcel(recruiterId: string, jobId?: string): Promise<Buffer> {
  return renderHiringDecisionReportExcel(await getRecruiterAnalytics(recruiterId, jobId));
}

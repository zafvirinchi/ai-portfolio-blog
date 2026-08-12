import { jdMatchService } from "../job-description/jd-service";
import { resumeService } from "../resume/resume-service";
import {
  BrowsableQuestion,
  computeCategoryCoveragePercent,
  computeInterviewCoverage,
  computeOverallCoveragePercent,
  computeReadinessLabel,
  CoverageCategory,
  InterviewCoverage,
  JdGapItem,
  PreparationPlanItem,
  ResumeEvidenceSummary,
  StudyPlanEntry,
  buildJdGapAnalysis,
  buildPreparationPlan,
  buildRecommendedAction,
  buildResumeEvidenceSummary,
  buildStudyPlan,
  deduplicateQuestions,
  flattenQuestionsForBrowsing,
} from "./interview-coverage";
import { prepService } from "./prep-service";

// Phase 17 Milestone 3 — the one new orchestrator this milestone adds.
// Deliberately a NEW, separate file rather than a change to
// prep-service.ts's own generate() method or PrepRecord/report schema
// (both left completely untouched — see the final report's "Protected"
// classifications) — this is a read-only analysis layer over an
// ALREADY-GENERATED report, composed entirely from existing, unmodified
// getters (prepService.get(), resumeService.get(), jdMatchService.get())
// plus this milestone's own pure interview-coverage.ts functions. Zero
// LLM calls; zero writes back to any store.
//
// Phase 17 Milestone 4 — extended (additively; every M3 field is
// unchanged) with the dashboard-facing fields the Interview Preparation
// Dashboard needs: readiness label, overall coverage %, a deterministic
// recommended-action sentence, JD gap analysis, a resume evidence
// summary, a flattened/filterable question list, and a derived study
// plan. All computed from the SAME already-fetched resume/jobDescription/
// report/coverage/plan this file already had — no repeated JD parsing,
// no repeated resume parsing, no second readiness calculation, no new
// LLM call.

export class InterviewIntelligenceNotFoundError extends Error {
  constructor() {
    super("Interview preparation report not found or expired.");
    this.name = "InterviewIntelligenceNotFoundError";
  }
}

export interface InterviewIntelligence {
  prepId: string;
  coverage: InterviewCoverage;
  plan: PreparationPlanItem[];
  duplicateQuestionsRemoved: number;
  totals: {
    totalQuestions: number;
    criticalCount: number;
    highPriorityCount: number;
  };
  readinessLabel: "Ready for Interview" | "Needs More Preparation";
  overallCoveragePercent: number | null;
  categoryCoveragePercents: Record<CoverageCategory, number | null>;
  recommendedAction: string;
  jdGaps: JdGapItem[];
  resumeEvidence: ResumeEvidenceSummary;
  questions: BrowsableQuestion[];
  studyPlan: StudyPlanEntry[];
}

/**
 * Phase 17 Milestone 7 — `cache` is an OPTIONAL, caller-owned Map, never a
 * module-level one: passing one lets a caller that resolves this SAME
 * prepId multiple times within one request (e.g. the mock-interview
 * progress route, computing a debrief for several sessions that all
 * share one linked prep report) skip redundant recomputation, without
 * ever risking staleness across requests — the cache lives and dies with
 * whatever the caller passed in. Every existing caller (the coverage
 * route, session-debrief.ts's own default) omits it and is completely
 * unaffected — this is purely additive.
 */
export function computeInterviewIntelligence(prepId: string, cache?: Map<string, InterviewIntelligence>): InterviewIntelligence {
  const cached = cache?.get(prepId);
  if (cached) return cached;

  const prepRecord = prepService.get(prepId);
  if (!prepRecord) throw new InterviewIntelligenceNotFoundError();

  const resumeRecord = resumeService.get(prepRecord.resumeId);
  const jdMatchRecord = jdMatchService.get(prepRecord.jdMatchId);

  // Both ephemeral stores share the exact 2h TTL prepService.generate()
  // itself depends on — if either has since expired, the report itself
  // is effectively stale too; report the same "not found or expired"
  // condition rather than computing coverage against missing context.
  if (!resumeRecord || !jdMatchRecord) throw new InterviewIntelligenceNotFoundError();

  const { report } = prepRecord;
  const { resume } = resumeRecord;
  const { jobDescription } = jdMatchRecord;

  const coverage = computeInterviewCoverage(resume, jobDescription, report);
  const plan = buildPreparationPlan(resume, jobDescription, report, coverage);

  // Deduplication (§6) is reported as a count, not applied destructively
  // to the stored report — prepService.generate()'s own output is never
  // mutated; this only tells the UI how many near-duplicates exist
  // across the combined technical+systemDesign question set so it can
  // be surfaced honestly rather than silently hidden or silently kept.
  const combined = [...report.technicalQuestions, ...report.systemDesignQuestions.map((q) => ({ ...q, topic: "System Design" }))];
  const { removed } = deduplicateQuestions(combined);

  const totalQuestions =
    report.technicalQuestions.length + report.hrQuestions.length + report.projectQuestions.length + report.systemDesignQuestions.length;

  const questions = flattenQuestionsForBrowsing(resume, jobDescription, report);

  // Category coverage percentages are computed here (server-only) rather
  // than by having presentation components import computeCategoryCoveragePercent
  // themselves — interview-coverage.ts transitively imports the metered
  // OpenAI client (via question-generator.ts), which reaches next/headers;
  // any client component importing a runtime binding from it directly
  // breaks the production build. Exposing plain pre-computed numbers here
  // keeps that entire chain server-side.
  const categoryCoveragePercents = Object.fromEntries(
    Object.entries(coverage).map(([category, categoryCoverage]) => [category, computeCategoryCoveragePercent(categoryCoverage)])
  ) as Record<CoverageCategory, number | null>;

  const intelligence: InterviewIntelligence = {
    prepId,
    coverage,
    plan,
    duplicateQuestionsRemoved: removed.length,
    totals: {
      totalQuestions,
      criticalCount: plan.filter((item) => item.priority === "CRITICAL").length,
      highPriorityCount: plan.filter((item) => item.priority === "HIGH").length,
    },
    readinessLabel: computeReadinessLabel(report.readinessScore.overall),
    overallCoveragePercent: computeOverallCoveragePercent(coverage),
    categoryCoveragePercents,
    recommendedAction: buildRecommendedAction(plan),
    jdGaps: buildJdGapAnalysis(resume, jobDescription, coverage, report),
    resumeEvidence: buildResumeEvidenceSummary(resume),
    questions,
    studyPlan: buildStudyPlan(questions),
  };

  cache?.set(prepId, intelligence);
  return intelligence;
}

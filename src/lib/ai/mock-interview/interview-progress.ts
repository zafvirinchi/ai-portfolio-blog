import { BrowsableQuestion, CoverageCategory, StudyPlanEntry, buildStudyPlan } from "../interview-prep/interview-coverage";
import { computeInterviewIntelligence, InterviewIntelligence, InterviewIntelligenceNotFoundError } from "../interview-prep/interview-intelligence-service";
import { CategoryPerformance, DemonstrationStatus, ReadinessRecommendation, SessionDebrief } from "./session-debrief";
import { SessionRecord } from "./session-types";

// Phase 17 Milestone 6 — a PURE, zero-LLM module, placed under
// mock-interview/ for the same reason session-debrief.ts (M5) is: it
// needs both SessionRecord and interview-prep's coverage/study-plan
// engines, and the one-directional layering rule (mock-interview already
// depends on interview-prep, never the reverse) only allows that
// combination from this side.
//
// Every value here is derived from ALREADY-COMPUTED data: each session's
// own SessionReport (score-engine.ts, Phase 13) and its own M5
// SessionDebrief (session-debrief.ts, itself built from M3's coverage/
// priority engine and M4's Study Plan). This module adds exactly one new
// kind of computation — comparing multiple of those already-computed
// results to each other — never a second scoring, readiness, coverage,
// or study-plan engine.
//
// This module is deliberately session-list-agnostic: it takes an
// already-resolved, already-context-filtered, already-chronologically-
// sorted array of { session, debrief } pairs and computes progress from
// them. It has no opinion about WHERE that list came from — see
// interview-progress-context.ts (client-only) and the API route for how
// the list is actually assembled under this app's ephemeral, listing-
// less session architecture (documented in the final report's audit
// section: sessionService has no list()/getAll() method, and none was
// added here).

// ---------------------------------------------------------------------------
// Context compatibility — "compare only compatible interview contexts."
// A small, directly-testable pure predicate the API route uses to filter
// which resolved sessions are even eligible for comparison, rather than
// inlining the check there where it can't be unit-tested in isolation.
// ---------------------------------------------------------------------------

export function isSameContext(session: SessionRecord, resumeId: string, jdMatchId: string): boolean {
  return session.resumeId === resumeId && session.jdMatchId === jdMatchId;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface SessionProgressPoint {
  session: SessionRecord;
  /** null for a resolved session that isn't completed yet (contributes to sessionsAttempted, never to sessionsCompleted or any score/trend). */
  debrief: SessionDebrief | null;
}

// ---------------------------------------------------------------------------
// Output model
// ---------------------------------------------------------------------------

export type Trend = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";

export interface CategoryProgress {
  category: CoverageCategory;
  /** Chronological, one entry per completed session that actually asked this category anything (averageScore !== null) — never a fabricated 0. */
  scores: number[];
  latest: number | null;
  previous: number | null;
  trend: Trend;
}

export interface ProgressArea {
  category: CoverageCategory;
  latest: number | null;
  previous: number | null;
  delta: number | null;
}

export type TopicProgressStatus = "PERSISTENT_WEAKNESS" | "IMPROVING" | "WATCH";

export interface TopicProgress {
  topic: string;
  category: CoverageCategory;
  /** Sessions where this topic had a real (non-"Not assessed") status — never counts a session that simply didn't ask about it. */
  assessedCount: number;
  /** Count of assessments that were "Not demonstrated" or "Partially demonstrated". */
  weakCount: number;
  latestStatus: DemonstrationStatus;
  status: TopicProgressStatus;
}

export type PracticeRecommendationPriority = "HIGH" | "MEDIUM" | "CONTINUE";

export interface PracticeRecommendation {
  priority: PracticeRecommendationPriority;
  topicOrCategory: string;
  reason: string;
}

export interface ProgressStudyPlanEntry extends StudyPlanEntry {
  moved: boolean;
  moveReason: string | null;
}

export interface InterviewProgress {
  sessionsAttempted: number;
  sessionsCompleted: number;

  latestScore: number | null;
  previousScore: number | null;
  scoreDelta: number | null;

  // Phase 17 Milestone 7 — audit finding: this used to independently
  // recompute a 2-level label (computeReadinessLabel, score-only) here,
  // while the Debrief tab showed M5's own 3-level, gap-aware
  // readinessRecommendation for the SAME session — the two could
  // genuinely disagree (e.g. score >= 60 but a critical topic still
  // undemonstrated: 2-level says "Ready", 3-level correctly says
  // "Practice a bit more"). Fixed by reusing M5's own already-computed
  // per-session value directly instead of a second, competing label.
  latestReadiness: ReadinessRecommendation | null;
  previousReadiness: ReadinessRecommendation | null;

  /** Average of each completed session's own summary.completionPercentage — null when there's nothing completed to average. */
  completionRate: number | null;

  categoryProgress: CategoryProgress[];
  improvingAreas: ProgressArea[];
  decliningAreas: ProgressArea[];
  persistentWeakAreas: TopicProgress[];
  repeatedMisses: TopicProgress[];

  recommendedNextPractice: PracticeRecommendation[];
  updatedStudyPlan: ProgressStudyPlanEntry[] | null;
  studyPlanUnavailableReason: string | null;

  trend: Trend;
}

const ALL_CATEGORIES: CoverageCategory[] = ["technical", "resume", "jd", "behavioral", "systemDesign", "coding"];
const CATEGORY_LABEL: Record<CoverageCategory, string> = {
  technical: "Technical",
  resume: "Resume",
  jd: "Job Description",
  behavioral: "Behavioral",
  systemDesign: "System Design",
  coding: "Coding",
};

// Step 5's own explicit minimum-observation threshold — a topic assessed
// only once, even if weak, is never called "persistent" (§5's own
// caution). Step 4's trend "noise band": a category score swing smaller
// than this is treated as STABLE rather than a fabricated improvement/
// decline from 1-2 points of evaluator noise. Both new to this milestone
// (no prior equivalent existed) and both documented here, not invented
// silently.
export const PERSISTENT_WEAKNESS_MIN_ASSESSMENTS = 2;
export const TREND_STABLE_BAND = 5;

function average(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function classifyDelta(delta: number): Trend {
  if (delta >= TREND_STABLE_BAND) return "IMPROVING";
  if (delta <= -TREND_STABLE_BAND) return "DECLINING";
  return "STABLE";
}

// ---------------------------------------------------------------------------
// Step 4 — Category trend analysis
// ---------------------------------------------------------------------------

function buildCategoryProgress(completed: { session: SessionRecord; debrief: SessionDebrief }[]): CategoryProgress[] {
  return ALL_CATEGORIES.map((category) => {
    const scores: number[] = [];

    for (const { debrief } of completed) {
      const performance = debrief.categoryPerformance.find((c: CategoryPerformance) => c.category === category);
      if (performance && performance.averageScore !== null) scores.push(performance.averageScore);
    }

    if (scores.length === 0) return { category, scores, latest: null, previous: null, trend: "INSUFFICIENT_DATA" as Trend };

    const latest = scores[scores.length - 1];
    const previous = scores.length >= 2 ? scores[scores.length - 2] : null;
    const trend: Trend = previous === null ? "INSUFFICIENT_DATA" : classifyDelta(latest - previous);

    return { category, scores, latest, previous, trend };
  });
}

function toProgressArea(category: CategoryProgress): ProgressArea {
  return { category: category.category, latest: category.latest, previous: category.previous, delta: category.previous !== null && category.latest !== null ? category.latest - category.previous : null };
}

// ---------------------------------------------------------------------------
// Step 5/6 — Persistent weakness + repeated misses. Both read the SAME
// per-session coverageImpact (M5) that already classifies each topic as
// Demonstrated/Partially demonstrated/Not demonstrated/Not assessed —
// no new normalization or similarity matching is introduced; topics are
// grouped by the exact `topic` string M3/M5 already assign.
// ---------------------------------------------------------------------------

function buildTopicProgress(completed: { session: SessionRecord; debrief: SessionDebrief }[]): TopicProgress[] {
  const buckets = new Map<string, { topic: string; category: CoverageCategory; statuses: DemonstrationStatus[] }>();

  for (const { debrief } of completed) {
    if (!debrief.coverageImpact) continue;

    for (const item of debrief.coverageImpact) {
      if (item.status === "Not assessed") continue; // never treat an unassessed topic as evidence of anything

      const key = `${item.category}::${item.topic}`;
      if (!buckets.has(key)) buckets.set(key, { topic: item.topic, category: item.category, statuses: [] });
      buckets.get(key)!.statuses.push(item.status);
    }
  }

  const results: TopicProgress[] = [];

  for (const { topic, category, statuses } of buckets.values()) {
    const assessedCount = statuses.length;
    const weakCount = statuses.filter((status) => status === "Not demonstrated" || status === "Partially demonstrated").length;
    const latestStatus = statuses[statuses.length - 1];

    // Step 5's own explicit rule: fewer than the minimum observation count
    // never gets classified at all, weak or otherwise — insufficient data
    // for THIS topic specifically, regardless of how many sessions exist overall.
    if (assessedCount < PERSISTENT_WEAKNESS_MIN_ASSESSMENTS || weakCount === 0) continue;

    const status: TopicProgressStatus = latestStatus === "Demonstrated" ? "IMPROVING" : weakCount >= PERSISTENT_WEAKNESS_MIN_ASSESSMENTS ? "PERSISTENT_WEAKNESS" : "WATCH";

    results.push({ topic, category, assessedCount, weakCount, latestStatus, status });
  }

  return results.sort((a, b) => b.weakCount - a.weakCount || a.topic.localeCompare(b.topic));
}

// ---------------------------------------------------------------------------
// Step 8 — Practice recommendations. Ordered HIGH, then MEDIUM, then
// CONTINUE — never free-form/LLM-generated.
// ---------------------------------------------------------------------------

function buildPracticeRecommendations(persistentWeakAreas: TopicProgress[], decliningAreas: ProgressArea[], improvingTopics: TopicProgress[]): PracticeRecommendation[] {
  const high: PracticeRecommendation[] = persistentWeakAreas.map((topic) => ({
    priority: "HIGH",
    topicOrCategory: topic.topic,
    reason: `Weak in ${topic.weakCount} of ${topic.assessedCount} assessed sessions.`,
  }));

  const medium: PracticeRecommendation[] = decliningAreas.map((area) => ({
    priority: "MEDIUM",
    topicOrCategory: CATEGORY_LABEL[area.category],
    reason: `Performance declined in the latest session (${area.previous} → ${area.latest}).`,
  }));

  const continue_: PracticeRecommendation[] = improvingTopics.map((topic) => ({
    priority: "CONTINUE",
    topicOrCategory: topic.topic,
    reason: "Improved in the latest session — continue reinforcement.",
  }));

  return [...high, ...medium, ...continue_];
}

// ---------------------------------------------------------------------------
// Step 7 — Study Plan integration. Reuses M4's buildStudyPlan() directly
// (never a second implementation) over a reordered copy of the LATEST
// completed session's own linked question list — persistent weaknesses
// move to the front, exactly like M5's reprioritization, but driven by
// MULTI-session history instead of one session's results.
// ---------------------------------------------------------------------------

function reprioritizeStudyPlanAcrossSessions(
  questions: BrowsableQuestion[],
  persistentWeakAreas: TopicProgress[],
  decliningAreas: ProgressArea[]
): ProgressStudyPlanEntry[] {
  const persistentTopics = new Set(persistentWeakAreas.map((t) => `${t.category}::${t.topic}`));
  const decliningCategories = new Set(decliningAreas.map((a) => a.category));

  const isPersistent = (q: BrowsableQuestion) => persistentTopics.has(`${q.category}::${q.topic}`);
  const isDeclining = (q: BrowsableQuestion) => !isPersistent(q) && decliningCategories.has(q.category);

  const persistent = questions.filter(isPersistent);
  const declining = questions.filter(isDeclining);
  const rest = questions.filter((q) => !isPersistent(q) && !isDeclining(q));

  const reordered = [...persistent, ...declining, ...rest].map((q, index) => ({ ...q, studyOrder: index + 1 }));
  const originalStudyOrderById = new Map(questions.map((q) => [q.id, q.studyOrder]));

  const plan = buildStudyPlan(reordered);

  return plan.map((entry, index) => {
    const question = reordered[index];
    const originalStudyOrder = originalStudyOrderById.get(question.id) ?? entry.step;
    const persistentMatch = isPersistent(question);
    const decliningMatch = !persistentMatch && isDeclining(question);
    const moved = (persistentMatch || decliningMatch) && entry.step < originalStudyOrder;

    return {
      ...entry,
      moved,
      moveReason: !moved ? null : persistentMatch ? "Repeated weakness across assessed sessions." : "Performance declined in the latest session.",
    };
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Phase 17 Milestone 7 — audit finding: sessions sharing one prepId (the
 * common case — every session started from the same page shares the
 * page's own prepId) each independently recomputed
 * computeInterviewIntelligence(prepId) once inside their own
 * buildSessionDebrief() call, and this function recomputed it AGAIN for
 * the study-plan step — up to (N+1)x redundant work for one history
 * request. `intelligenceCache` is optional and request-scoped only (see
 * interview-intelligence-service.ts's own comment on why this is
 * correctness-safe); the API route creates one and passes the SAME map
 * into every buildSessionDebrief() call and this function.
 */
export function computeInterviewProgress(points: SessionProgressPoint[], intelligenceCache?: Map<string, InterviewIntelligence>): InterviewProgress {
  const sessionsAttempted = points.length;
  const completed = points.filter(
    (point): point is { session: SessionRecord; debrief: SessionDebrief } => point.session.status === "completed" && point.debrief !== null
  );
  const sessionsCompleted = completed.length;

  if (sessionsCompleted === 0) {
    return {
      sessionsAttempted,
      sessionsCompleted: 0,
      latestScore: null,
      previousScore: null,
      scoreDelta: null,
      latestReadiness: null,
      previousReadiness: null,
      completionRate: null,
      categoryProgress: ALL_CATEGORIES.map((category) => ({ category, scores: [], latest: null, previous: null, trend: "INSUFFICIENT_DATA" })),
      improvingAreas: [],
      decliningAreas: [],
      persistentWeakAreas: [],
      repeatedMisses: [],
      recommendedNextPractice: [],
      updatedStudyPlan: null,
      studyPlanUnavailableReason: "No completed sessions yet.",
      trend: "INSUFFICIENT_DATA",
    };
  }

  const latest = completed[completed.length - 1];
  const previous = completed.length >= 2 ? completed[completed.length - 2] : null;

  const latestScore = latest.session.report!.overallScore;
  const previousScore = previous ? previous.session.report!.overallScore : null;
  const scoreDelta = previousScore !== null ? latestScore - previousScore : null;

  const latestReadiness = latest.debrief.readinessRecommendation;
  const previousReadiness = previous ? previous.debrief.readinessRecommendation : null;

  const completionRate = average(completed.map((point) => point.debrief.summary.completionPercentage));

  const categoryProgress = buildCategoryProgress(completed);
  const improvingAreas = categoryProgress.filter((c) => c.trend === "IMPROVING").map(toProgressArea);
  const decliningAreas = categoryProgress.filter((c) => c.trend === "DECLINING").map(toProgressArea);

  const topicProgress = buildTopicProgress(completed);
  const persistentWeakAreas = topicProgress.filter((t) => t.status === "PERSISTENT_WEAKNESS");
  const improvingTopics = topicProgress.filter((t) => t.status === "IMPROVING");
  // Broader historical signal than persistentWeakAreas — includes topics
  // that struggled repeatedly even if the latest attempt improved, since
  // that's still useful "this came up more than once" information.
  const repeatedMisses = topicProgress.filter((t) => t.weakCount >= PERSISTENT_WEAKNESS_MIN_ASSESSMENTS);

  const recommendedNextPractice = buildPracticeRecommendations(persistentWeakAreas, decliningAreas, improvingTopics);

  const trend: Trend = completed.length < 2 || scoreDelta === null ? "INSUFFICIENT_DATA" : classifyDelta(scoreDelta);

  let updatedStudyPlan: ProgressStudyPlanEntry[] | null = null;
  let studyPlanUnavailableReason: string | null = null;

  if (!latest.session.prepId) {
    studyPlanUnavailableReason = "The latest session wasn't linked to an Interview Preparation report, so a reprioritized study plan isn't available.";
  } else {
    try {
      const intelligence = computeInterviewIntelligence(latest.session.prepId, intelligenceCache);
      updatedStudyPlan = reprioritizeStudyPlanAcrossSessions(intelligence.questions, persistentWeakAreas, decliningAreas);
    } catch (error) {
      if (!(error instanceof InterviewIntelligenceNotFoundError)) throw error;
      studyPlanUnavailableReason = "The linked Interview Preparation report has since expired, so a reprioritized study plan isn't available.";
    }
  }

  return {
    sessionsAttempted,
    sessionsCompleted,
    latestScore,
    previousScore,
    scoreDelta,
    latestReadiness,
    previousReadiness,
    completionRate,
    categoryProgress,
    improvingAreas,
    decliningAreas,
    persistentWeakAreas,
    repeatedMisses,
    recommendedNextPractice,
    updatedStudyPlan,
    studyPlanUnavailableReason,
    trend,
  };
}

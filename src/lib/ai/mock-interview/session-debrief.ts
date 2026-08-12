import {
  BrowsableQuestion,
  CoverageCategory,
  deduplicateQuestions,
  normalizeTopic,
  PreparationPlanItem,
  PriorityLevel,
  READINESS_LABEL_THRESHOLD,
  StudyPlanEntry,
  buildStudyPlan,
} from "../interview-prep/interview-coverage";
import { computeInterviewIntelligence, InterviewIntelligence, InterviewIntelligenceNotFoundError } from "../interview-prep/interview-intelligence-service";
import { SessionQuestion } from "./session-schema";
import { sessionService } from "./session-service";
import { SessionRecord } from "./session-types";

// Phase 17 Milestone 5 — a PURE, zero-LLM module, deliberately placed
// under mock-interview/ (not interview-prep/, despite the milestone
// spec's suggested path) because it needs BOTH mock-interview's own
// SessionRecord/transcript AND interview-prep's coverage/study-plan
// engines — and the established one-directional layering rule (M3's own
// comment: "interview-prep is a dependency OF mock-interview, never the
// reverse") only allows that combination from this side. session-
// service.ts already imports from ../interview-prep/* the same way.
//
// Every classification here reads already-computed data (SessionRecord's
// own transcript/report, and M3/M4's already-generated coverage/plan/
// study-plan) and derives new labels deterministically. No new question
// generator, evaluator, readiness engine, or coverage engine — see the
// final report's audit section for the full reuse inventory.

export class SessionDebriefNotFoundError extends Error {
  constructor() {
    super("Mock interview session not found or expired.");
    this.name = "SessionDebriefNotFoundError";
  }
}

export class SessionNotCompletedError extends Error {
  constructor() {
    super("This mock interview session hasn't been completed yet — end the interview to generate a debrief.");
    this.name = "SessionNotCompletedError";
  }
}

// ---------------------------------------------------------------------------
// Step 2 — Session summary
// ---------------------------------------------------------------------------

export interface SessionDebriefSummary {
  totalQuestions: number;
  answeredQuestions: number;
  skippedQuestions: number;
  evaluatedQuestions: number;
  overallScore: number;
  readinessLevel: number;
  completionPercentage: number;
}

function buildSummary(session: SessionRecord): SessionDebriefSummary {
  const totalQuestions = session.questions.length;
  const answeredQuestions = session.transcript.length;
  const skippedQuestions = session.questionsMissedText.length;

  return {
    totalQuestions,
    answeredQuestions,
    skippedQuestions,
    evaluatedQuestions: answeredQuestions,
    overallScore: session.report!.overallScore,
    readinessLevel: session.report!.interviewReadiness,
    completionPercentage: totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Step 2 — Category performance. Deliberately keyed by the SAME 6
// CoverageCategory values M3/M4 already use (technical/resume/jd/
// behavioral/systemDesign/coding) — the milestone's own required table
// (Technical/Resume/JD/Behavioral/System Design/Coding) is exactly that
// taxonomy, not mock-interview's own 8-key CategoryScores (technical/
// communication/problemSolving/architecture/leadership/confidence/coding/
// behavioral, score-engine.ts), which answers a different question
// (evaluation-dimension mix, not JD/resume/coverage alignment). This is a
// new, small, deterministic mapping — not a second scoring engine, since
// it never re-scores an answer, only re-labels each already-asked
// question by which of the two taxonomies it belongs to.
// ---------------------------------------------------------------------------

export type PerformanceLevel = "Strong" | "Moderate" | "Needs Practice" | "Not Assessed";

export interface CategoryPerformance {
  category: CoverageCategory;
  questionsAsked: number;
  questionsAnswered: number;
  averageScore: number | null;
  performanceLevel: PerformanceLevel;
  strengths: string[];
  weaknesses: string[];
}

// Reuses interview-coverage.ts's own READINESS_LABEL_THRESHOLD (60) as the
// "demonstrated"/"Strong" bar — the same number that already means
// "ready" for the candidate's overall readiness score, never a second
// invented cutoff. PARTIAL_DEMONSTRATION_THRESHOLD (30) is new to this
// milestone: below it, a genuinely answered question reflects a real,
// substantive gap rather than a rough edge, so it's treated as "Not
// demonstrated"/"Needs Practice" rather than "Partially demonstrated"/
// "Moderate".
export const DEMONSTRATED_THRESHOLD = READINESS_LABEL_THRESHOLD;
export const PARTIAL_DEMONSTRATION_THRESHOLD = 30;

const CATEGORY_STRENGTH_WEAKNESS_LIMIT = 5;

function categorizeSessionQuestion(question: SessionQuestion): CoverageCategory {
  if (question.type === "System Design" || question.type === "Architecture") return "systemDesign";
  if (question.type === "Coding Discussion") return "coding";
  if (question.type === "HR" || question.type === "Behavioral" || question.type === "Leadership") return "behavioral";
  if (question.source === "resume" || question.type === "Project Deep Dive") return "resume";
  if (question.source === "jd") return "jd";
  return "technical";
}

function performanceLevelFor(averageScore: number | null): PerformanceLevel {
  if (averageScore === null) return "Not Assessed";
  if (averageScore >= DEMONSTRATED_THRESHOLD) return "Strong";
  if (averageScore >= PARTIAL_DEMONSTRATION_THRESHOLD) return "Moderate";
  return "Needs Practice";
}

function average(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildCategoryPerformance(session: SessionRecord): CategoryPerformance[] {
  const categories: CoverageCategory[] = ["technical", "resume", "jd", "behavioral", "systemDesign", "coding"];

  const buckets = new Map<CoverageCategory, { asked: number; scores: number[]; strengths: string[]; weaknesses: string[] }>(
    categories.map((category) => [category, { asked: 0, scores: [], strengths: [], weaknesses: [] }])
  );

  for (const question of session.questions) {
    buckets.get(categorizeSessionQuestion(question))!.asked += 1;
  }

  for (const turn of session.transcript) {
    const bucket = buckets.get(categorizeSessionQuestion(turn.question))!;
    bucket.scores.push(turn.evaluation.overallScore);
    for (const strength of turn.evaluation.strengths) {
      if (!bucket.strengths.includes(strength) && bucket.strengths.length < CATEGORY_STRENGTH_WEAKNESS_LIMIT) bucket.strengths.push(strength);
    }
    for (const weakness of turn.evaluation.weaknesses) {
      if (!bucket.weaknesses.includes(weakness) && bucket.weaknesses.length < CATEGORY_STRENGTH_WEAKNESS_LIMIT) bucket.weaknesses.push(weakness);
    }
  }

  return categories.map((category) => {
    const bucket = buckets.get(category)!;
    const averageScore = bucket.scores.length > 0 ? average(bucket.scores) : null;

    return {
      category,
      questionsAsked: bucket.asked,
      questionsAnswered: bucket.scores.length,
      averageScore,
      performanceLevel: performanceLevelFor(averageScore),
      strengths: bucket.strengths,
      weaknesses: bucket.weaknesses,
    };
  });
}

// ---------------------------------------------------------------------------
// Step 3/4 — Coverage cross-reference. Conservative, 4-state semantics:
// a topic the session never touched is "Not assessed", never "missing" —
// the spec's own explicit caution (§3).
// ---------------------------------------------------------------------------

export type DemonstrationStatus = "Demonstrated" | "Partially demonstrated" | "Not demonstrated" | "Not assessed";

interface TopicPerformance {
  status: Exclude<DemonstrationStatus, "Not assessed">;
  averageScore: number | null;
}

/**
 * Groups this session's own transcript by normalized question topic.
 * Near-duplicate questions (Step 10) are collapsed first via M3's own
 * deduplicateQuestions() so a repeated/rephrased question doesn't get
 * double-counted when judging whether a topic was demonstrated.
 */
function buildTopicPerformanceMap(session: SessionRecord): Map<string, TopicPerformance> {
  const dedupedTurns = deduplicateQuestions(
    session.transcript.map((turn) => ({ question: turn.question.text, topic: turn.question.topic, turn }))
  ).kept;

  const scoreBuckets = new Map<string, number[]>();
  for (const { topic, turn } of dedupedTurns) {
    const key = normalizeTopic(topic);
    if (!key) continue;
    if (!scoreBuckets.has(key)) scoreBuckets.set(key, []);
    scoreBuckets.get(key)!.push(turn.evaluation.overallScore);
  }

  const map = new Map<string, TopicPerformance>();
  for (const [key, scores] of scoreBuckets) {
    const averageScore = average(scores);
    map.set(key, {
      status: averageScore >= DEMONSTRATED_THRESHOLD ? "Demonstrated" : averageScore >= PARTIAL_DEMONSTRATION_THRESHOLD ? "Partially demonstrated" : "Not demonstrated",
      averageScore,
    });
  }

  // Skipped questions (session-manager.ts's skip()) never produce a
  // transcript turn — matched back to a topic via the question text
  // session.questionsMissedText records, and only recorded here if that
  // topic wasn't ALSO genuinely answered elsewhere in the session (an
  // answered turn is real evidence and takes priority over a skip).
  for (const missedText of session.questionsMissedText) {
    const question = session.questions.find((q) => q.text === missedText);
    if (!question) continue;
    const key = normalizeTopic(question.topic);
    if (!key || map.has(key)) continue;
    map.set(key, { status: "Not demonstrated", averageScore: null });
  }

  return map;
}

export interface CoverageImpactItem {
  topic: string;
  category: CoverageCategory;
  priority: PriorityLevel;
  status: DemonstrationStatus;
  averageScore: number | null;
}

/** Scoped to the Preparation Plan's own topics (technical/JD/resume — see interview-coverage.ts's own comment on why behavioral/systemDesign/coding topics don't carry a JD-mandatory-style priority) — the exact "important coverage item" list M3/M4 already curate and priority-tag, never a second priority scheme invented for categories that don't have one. */
function buildCoverageImpact(plan: PreparationPlanItem[], topicPerformance: Map<string, TopicPerformance>): CoverageImpactItem[] {
  return plan.map((item) => {
    const performance = topicPerformance.get(normalizeTopic(item.topic));

    return {
      topic: item.topic,
      category: item.category,
      priority: item.priority,
      status: performance?.status ?? "Not assessed",
      averageScore: performance?.averageScore ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Step 4 — Priority-aware debrief
// ---------------------------------------------------------------------------

const CRITICAL_WEAKNESS_PRIORITIES: PriorityLevel[] = ["CRITICAL", "HIGH"];

function recommendationFor(item: CoverageImpactItem): string {
  switch (item.category) {
    case "systemDesign":
      return `Practice a system-design walkthrough for ${item.topic}.`;
    case "coding":
      return `Practice a coding problem on ${item.topic}.`;
    case "behavioral":
      return `Practice a STAR response for ${item.topic}.`;
    case "resume":
      return `Practice explaining ${item.topic} in more depth — the specific challenge, your contribution, and the outcome.`;
    case "jd":
    case "technical":
    default:
      return `Revisit ${item.topic} and practice another answer on it.`;
  }
}

// ---------------------------------------------------------------------------
// Step 5 — Study Plan reprioritization. Reuses M4's buildStudyPlan()
// directly (same Today/Next/Later bucketing, same step numbering) over a
// REORDERED copy of the input questions — never a second study-plan
// implementation.
// ---------------------------------------------------------------------------

export interface ReprioritizedStudyPlanEntry extends StudyPlanEntry {
  moved: boolean;
  moveReason: string | null;
}

function reprioritizeStudyPlan(questions: BrowsableQuestion[], topicPerformance: Map<string, TopicPerformance>): ReprioritizedStudyPlanEntry[] {
  const isWeak = (topic: string) => topicPerformance.get(normalizeTopic(topic))?.status === "Not demonstrated";

  const weak = questions.filter((q) => isWeak(q.topic));
  const rest = questions.filter((q) => !isWeak(q.topic));
  const reordered = [...weak, ...rest].map((q, index) => ({ ...q, studyOrder: index + 1 }));

  const originalStudyOrderById = new Map(questions.map((q) => [q.id, q.studyOrder]));
  const plan = buildStudyPlan(reordered);

  return plan.map((entry, index) => {
    const question = reordered[index];
    const performance = topicPerformance.get(normalizeTopic(question.topic));
    const originalStudyOrder = originalStudyOrderById.get(question.id) ?? entry.step;
    const moved = isWeak(question.topic) && entry.step < originalStudyOrder;

    return {
      ...entry,
      moved,
      moveReason: !moved
        ? null
        : performance?.averageScore !== null && performance?.averageScore !== undefined
          ? `Moved higher because this topic was assessed in the mock interview and the response scored below the readiness threshold (${performance.averageScore}/100).`
          : "Moved higher because this topic's question was skipped during the mock interview.",
    };
  });
}

// ---------------------------------------------------------------------------
// Step 6 — Readiness recommendation. Built entirely from the existing
// readiness engine's own output (session.report.interviewReadiness — the
// score-engine.ts blend of this session's real performance with M3's
// prior predicted readiness) plus this milestone's own critical-gap
// count — never a second readiness score.
// ---------------------------------------------------------------------------

export type ReadinessRecommendation = "READY_FOR_INTERVIEW" | "PRACTICE_BEFORE_INTERVIEW" | "NEEDS_FOCUSED_PREPARATION";

// READY_FOR_INTERVIEW reuses READINESS_LABEL_THRESHOLD (60, same bar as
// the rest of Phase 17). NEEDS_FOCUSED_PREPARATION's floor reuses
// PARTIAL_DEMONSTRATION_THRESHOLD (30) for the same reason it's used
// above — below it, session performance reflects a broad, not marginal,
// gap. 3-or-more still-undemonstrated CRITICAL/HIGH topics is treated as
// the same "broad gap" signal even when the blended score alone doesn't
// dip below 30.
const BROAD_GAP_CRITICAL_WEAKNESS_COUNT = 3;

function computeReadinessRecommendation(interviewReadiness: number, criticalWeaknessCount: number): ReadinessRecommendation {
  if (interviewReadiness >= READINESS_LABEL_THRESHOLD && criticalWeaknessCount === 0) return "READY_FOR_INTERVIEW";
  if (interviewReadiness < PARTIAL_DEMONSTRATION_THRESHOLD || criticalWeaknessCount >= BROAD_GAP_CRITICAL_WEAKNESS_COUNT) return "NEEDS_FOCUSED_PREPARATION";
  return "PRACTICE_BEFORE_INTERVIEW";
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface SessionDebrief {
  sessionId: string;
  summary: SessionDebriefSummary;
  categoryPerformance: CategoryPerformance[];
  readinessRecommendation: ReadinessRecommendation;
  coverageImpact: CoverageImpactItem[] | null;
  criticalWeaknesses: CoverageImpactItem[] | null;
  strongAreas: CoverageImpactItem[] | null;
  practiceRecommendations: string[] | null;
  updatedStudyPlan: ReprioritizedStudyPlanEntry[] | null;
  /** Non-null only when coverage/study-plan comparison genuinely isn't available (no linked prep report, or it has since expired) — never silently empty. */
  coverageUnavailableReason: string | null;
}

/**
 * Phase 17 Milestone 7 — `intelligenceCache` is optional and caller-owned
 * (never module-level); see interview-intelligence-service.ts's own
 * comment. Lets the progress route (M6) avoid recomputing the SAME
 * prepId's coverage/plan/study-plan once per historical session that
 * happens to share it — every existing caller (the debrief API route,
 * this file's own tests) omits it and behaves exactly as before.
 */
export function buildSessionDebrief(sessionId: string, intelligenceCache?: Map<string, InterviewIntelligence>): SessionDebrief {
  const session = sessionService.get(sessionId);
  if (!session) throw new SessionDebriefNotFoundError();
  if (session.status !== "completed" || !session.report) throw new SessionNotCompletedError();

  const summary = buildSummary(session);
  const categoryPerformance = buildCategoryPerformance(session);

  let coverageUnavailableReason: string | null = null;

  if (!session.prepId) {
    coverageUnavailableReason =
      "This mock interview session wasn't linked to an Interview Preparation report, so coverage and study-plan comparisons aren't available.";
  }

  if (session.prepId) {
    try {
      const intelligence = computeInterviewIntelligence(session.prepId, intelligenceCache);
      const topicPerformance = buildTopicPerformanceMap(session);
      const coverageImpact = buildCoverageImpact(intelligence.plan, topicPerformance);
      const criticalWeaknesses = coverageImpact.filter(
        (item) => CRITICAL_WEAKNESS_PRIORITIES.includes(item.priority) && item.status === "Not demonstrated"
      );
      const strongAreas = coverageImpact.filter((item) => item.status === "Demonstrated");
      const practiceRecommendations = criticalWeaknesses.map(recommendationFor);
      const updatedStudyPlan = reprioritizeStudyPlan(intelligence.questions, topicPerformance);

      return {
        sessionId,
        summary,
        categoryPerformance,
        readinessRecommendation: computeReadinessRecommendation(session.report.interviewReadiness, criticalWeaknesses.length),
        coverageImpact,
        criticalWeaknesses,
        strongAreas,
        practiceRecommendations,
        updatedStudyPlan,
        coverageUnavailableReason: null,
      };
    } catch (error) {
      if (!(error instanceof InterviewIntelligenceNotFoundError)) throw error;
      coverageUnavailableReason =
        "The linked Interview Preparation report has since expired, so coverage and study-plan comparisons aren't available for this session.";
    }
  }

  return {
    sessionId,
    summary,
    categoryPerformance,
    readinessRecommendation: computeReadinessRecommendation(session.report.interviewReadiness, 0),
    coverageImpact: null,
    criticalWeaknesses: null,
    strongAreas: null,
    practiceRecommendations: null,
    updatedStudyPlan: null,
    coverageUnavailableReason,
  };
}

import { CategoryKey, CategoryScores, InterviewType, TopicScore, TranscriptTurn } from "./session-schema";

// Deterministic session-level scoring — pure math over already-computed
// per-answer scores (answer-evaluator.ts), same "compute what can be
// computed" discipline as every score in this arc.

// Which report categories a turn contributes to, based on the question's
// own (already-resolved-to-a-concrete-type, see question-selector.ts)
// type — not its raw dimensions, since categories like "Coding"/
// "Leadership" don't correspond to a single dimension name.
const CATEGORIES_BY_TYPE: Record<InterviewType, readonly CategoryKey[]> = {
  Technical: ["technical"],
  HR: ["behavioral", "communication"],
  Behavioral: ["behavioral", "communication"],
  "System Design": ["architecture", "technical"],
  "Coding Discussion": ["coding", "problemSolving"],
  "Project Deep Dive": ["architecture", "problemSolving"],
  Leadership: ["leadership", "communication"],
  Architecture: ["architecture"],
  // Unreachable in practice — question.type is always resolved to a
  // concrete sub-type before a turn is recorded (see question-selector.ts's
  // Mixed-rotation handling). Kept only so this Record stays exhaustive.
  Mixed: ["technical"],
};

function average(values: number[]): number {
  return values.length === 0 ? 0 : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** A category with no applicable turns this session reports as 0 — the UI treats 0 with an empty topicScores/transcript entry for that category as "not assessed" rather than "failed." */
export function computeCategoryScores(transcript: TranscriptTurn[]): CategoryScores {
  const buckets: Record<CategoryKey, number[]> = {
    technical: [],
    communication: [],
    problemSolving: [],
    architecture: [],
    leadership: [],
    confidence: [],
    coding: [],
    behavioral: [],
  };

  for (const turn of transcript) {
    const confidence = turn.evaluation.dimensions.confidence;
    if (typeof confidence === "number") buckets.confidence.push(confidence);

    for (const category of CATEGORIES_BY_TYPE[turn.question.type]) {
      buckets[category].push(turn.evaluation.overallScore);
    }
  }

  return {
    technical: average(buckets.technical),
    communication: average(buckets.communication),
    problemSolving: average(buckets.problemSolving),
    architecture: average(buckets.architecture),
    leadership: average(buckets.leadership),
    confidence: average(buckets.confidence),
    coding: average(buckets.coding),
    behavioral: average(buckets.behavioral),
  };
}

/** Simple mean of every answered turn's overallScore — deliberately not a weighted blend of computeCategoryScores, since a single-type session (e.g. all-Technical) would otherwise have its score dragged toward the untouched categories' 0s. */
export function computeOverallScore(transcript: TranscriptTurn[]): number {
  return average(transcript.map((turn) => turn.evaluation.overallScore));
}

/** Blends demonstrated session performance with the optional Milestone-3 predicted readiness score — actual performance dominates (70/30) since it's a real signal, not a prediction. */
export function computeInterviewReadiness(overallScore: number, priorReadiness?: number | null): number {
  if (typeof priorReadiness !== "number") return overallScore;

  return Math.round(overallScore * 0.7 + priorReadiness * 0.3);
}

export function computeTopicScores(transcript: TranscriptTurn[]): TopicScore[] {
  const buckets = new Map<string, number[]>();

  for (const turn of transcript) {
    const key = turn.question.topic;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(turn.evaluation.overallScore);
  }

  return Array.from(buckets.entries()).map(([topic, scores]) => ({ topic, score: average(scores) }));
}

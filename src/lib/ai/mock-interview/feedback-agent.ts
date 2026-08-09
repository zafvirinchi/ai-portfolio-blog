import { WeaknessAnalysis } from "../interview-prep/prep-schema";
import { SkillGap } from "../resume/resume-schema";
import { AnswerEvaluation, TranscriptTurn } from "./session-schema";

// Two distinct concerns, both deterministic post-processing over already-
// computed evaluations (no LLM call here):
//  - formatLiveFeedback: shapes ONE answer's evaluation for the Live
//    Feedback tab / chat "explain better answer" flow.
//  - aggregateSessionFeedback: cross-turn aggregation for the final report.

export interface LiveFeedback {
  headline: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  missingConcepts: string[];
  betterAnswer: string;
  idealAnswer: string;
  improvementTips: string[];
  followUp: string | null;
}

function headlineFor(score: number): string {
  if (score >= 80) return "Strong answer.";
  if (score >= 60) return "Solid, with room to sharpen.";
  if (score >= 40) return "Partial — some real gaps to address.";
  return "Needs significant work.";
}

export function formatLiveFeedback(evaluation: AnswerEvaluation): LiveFeedback {
  return {
    headline: headlineFor(evaluation.overallScore),
    score: evaluation.overallScore,
    strengths: evaluation.strengths,
    weaknesses: evaluation.weaknesses,
    missingConcepts: evaluation.missingConcepts,
    betterAnswer: evaluation.betterAnswer,
    idealAnswer: evaluation.idealAnswer,
    improvementTips: evaluation.improvementTips,
    followUp: evaluation.followUpNeeded ? evaluation.followUpQuestion : null,
  };
}

export interface SessionFeedbackSummary {
  strengths: string[];
  weaknesses: string[];
  topImprovements: string[];
  questionsMissed: string[];
}

const AGGREGATE_LIMIT = 8;

/** Ranks by how often the same feedback point recurred across turns — a weakness mentioned in 4 of 6 answers matters more than one mentioned once. */
function countAndRank(lists: string[][], limit: number): string[] {
  const counts = new Map<string, number>();

  for (const list of lists) {
    for (const item of list) {
      const key = item.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item);
}

export function aggregateSessionFeedback(transcript: TranscriptTurn[], questionsMissedText: string[]): SessionFeedbackSummary {
  const strengths = countAndRank(transcript.map((turn) => turn.evaluation.strengths), AGGREGATE_LIMIT);
  const weaknesses = countAndRank(transcript.map((turn) => turn.evaluation.weaknesses), AGGREGATE_LIMIT);
  const topImprovements = countAndRank(
    transcript.map((turn) => [...turn.evaluation.missingConcepts, ...turn.evaluation.improvementTips]),
    AGGREGATE_LIMIT
  );

  return { strengths, weaknesses, topImprovements, questionsMissed: questionsMissedText };
}

/**
 * Reshapes the session's own aggregated feedback into the shape
 * interview-prep's (protected, read-only) buildLearningRoadmap() expects —
 * reuses real, already-proven bucketing logic instead of re-implementing a
 * roadmap builder for session reports.
 */
export function buildWeaknessAnalysisForRoadmap(summary: SessionFeedbackSummary, skillGap: SkillGap): WeaknessAnalysis {
  return {
    weakAreas: summary.weaknesses,
    missingSkills: [],
    knowledgeGaps: summary.topImprovements,
    projectsToBuild: skillGap.recommendedProjects,
    conceptsToLearn: summary.topImprovements.slice(0, 10),
  };
}

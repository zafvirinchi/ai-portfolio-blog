import { CandidateScoreBreakdown, CandidateSummary, RankedCandidate } from "./candidate-types";

// Deterministic, no LLM call. Weighted composite over
// candidate-score.ts's per-candidate breakdown — weight is
// redistributed proportionally across only the factors actually
// populated for a given candidate (design decision 6), so a candidate
// without a JD match yet still ranks sensibly on what IS known rather
// than being penalized to zero for missing data.

const RANKING_FACTORS: { key: keyof CandidateScoreBreakdown; weight: number }[] = [
  { key: "atsScore", weight: 0.2 },
  { key: "jdMatch", weight: 0.2 },
  { key: "experienceScore", weight: 0.15 },
  { key: "skillsScore", weight: 0.1 },
  { key: "projectsScore", weight: 0.1 },
  { key: "certificationScore", weight: 0.05 },
  { key: "leadershipScore", weight: 0.1 },
  { key: "interviewReadiness", weight: 0.1 },
];

export function computeRankingScore(scores: CandidateScoreBreakdown): number {
  const available = RANKING_FACTORS.filter((factor) => scores[factor.key] !== null);

  if (available.length === 0) {
    return scores.resumeScore ?? scores.overallScore ?? 0;
  }

  const totalWeight = available.reduce((sum, factor) => sum + factor.weight, 0);
  const weighted = available.reduce((sum, factor) => sum + (scores[factor.key] as number) * (factor.weight / totalWeight), 0);

  return Math.round(weighted);
}

export function rankCandidates(summaries: CandidateSummary[]): RankedCandidate[] {
  return summaries
    .map((summary) => ({ candidateId: summary.candidateId, rankingScore: computeRankingScore(summary.scores), summary }))
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

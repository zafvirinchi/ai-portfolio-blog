import { CandidateFitLevel, CandidateScoreBreakdown, CandidateSummary, RankedCandidate } from "./candidate-types";

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

/**
 * Phase 16 Milestone 1, §8 — "Candidate Fit Level." No existing tier
 * scheme in this codebase is specifically authoritative for a
 * recruiter-facing suitability judgment (the closest analogues —
 * resume-score.ts's ATS verdict at 85/70/50, ats-explainability.ts's
 * 5-tier Resume Health at 95/80/65/50 — both describe resume/ATS
 * *quality*, a different concept from candidate *fit for this role*),
 * so per §8's own explicit permission this documents its own choice:
 * the thresholds the milestone spec itself suggests (90/75/60),
 * applied to the SAME rankingScore computeRankingScore() already
 * produces — never a second score.
 */
export function classifyCandidateFitLevel(rankingScore: number): CandidateFitLevel {
  if (rankingScore >= 90) return "STRONG";
  if (rankingScore >= 75) return "GOOD";
  if (rankingScore >= 60) return "MODERATE";
  return "LOW";
}

/**
 * §9/§10 — explicit, deterministic tie-breakers so the SAME input
 * always produces the SAME order, not merely "whatever the array
 * happened to be sorted as before" (stable-sort behavior, while
 * technically reproducible for one fixed input array, isn't what
 * "deterministic tie-breaking on candidate attributes" means here).
 * Cascade: JD Match -> Skills -> Experience -> ATS, each treating a
 * missing (null) value as lowest rather than crashing or coercing to
 * 0-as-a-real-score; candidateId is the final, always-available
 * tie-breaker so two genuinely identical candidates still sort in one
 * fixed, reproducible order.
 */
const TIE_BREAK_FACTORS: (keyof CandidateScoreBreakdown)[] = ["jdMatch", "skillsScore", "experienceScore", "atsScore"];

/**
 * Exported for direct testing: because jdMatch/skillsScore/
 * experienceScore/atsScore are simultaneously ranking-weight factors
 * AND tie-breakers, two candidates with a genuinely different
 * tie-break attribute almost always also have a different overall
 * rankingScore (the tie-break factor's own weight moves it) — an
 * organic end-to-end "same score, different tie-break input" fixture
 * is impractical to construct by hand. Testing this comparator in
 * isolation is more direct and more robust than reverse-engineering
 * a coincidental weighted tie.
 */
export function compareRanked(a: { rankingScore: number; summary: CandidateSummary }, b: { rankingScore: number; summary: CandidateSummary }): number {
  if (a.rankingScore !== b.rankingScore) return b.rankingScore - a.rankingScore;

  for (const factor of TIE_BREAK_FACTORS) {
    const aValue = a.summary.scores[factor];
    const bValue = b.summary.scores[factor];
    if (aValue === bValue) continue;
    if (aValue === null) return 1; // missing data sorts after present data, never treated as 0
    if (bValue === null) return -1;
    return bValue - aValue;
  }

  return a.summary.candidateId.localeCompare(b.summary.candidateId);
}

export function rankCandidates(summaries: CandidateSummary[]): RankedCandidate[] {
  return summaries
    .map((summary) => ({ candidateId: summary.candidateId, rankingScore: computeRankingScore(summary.scores), summary }))
    .sort(compareRanked)
    .map((item, index) => ({ ...item, rank: index + 1, level: classifyCandidateFitLevel(item.rankingScore) }));
}

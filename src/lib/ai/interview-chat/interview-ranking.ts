import { extractKeywords } from "./interview-search";
import { InterviewCandidate, RankedInterviewCandidate } from "./interview-types";

export const MAX_INTERVIEW_RESULTS = 10;

// Priority order per spec: Question Match -> Tags Match -> Topic Match ->
// Category Match -> Difficulty Match. Implemented as weighted scoring
// (higher weight = higher priority), same pattern already used elsewhere
// in this codebase (ToolSelector, resume-suggestions.ts).
const WEIGHTS = {
  questionExact: 200,
  questionKeyword: 60,
  tags: 30,
  topic: 18,
  category: 10,
  difficulty: 5,
} as const;

function inferPreferredDifficulty(question: string): string | undefined {
  const lower = question.toLowerCase();

  if (lower.includes("easy") || lower.includes("simple") || lower.includes("beginner")) return "Easy";
  if (lower.includes("hard") || lower.includes("advanced") || lower.includes("expert")) return "Hard";
  if (lower.includes("medium") || lower.includes("intermediate")) return "Medium";

  return undefined;
}

/**
 * Scores and sorts candidates by relevance, capped at MAX_INTERVIEW_RESULTS.
 * Pure function — same inputs always produce the same ranking.
 */
export function rankInterviewResults(
  question: string,
  candidates: InterviewCandidate[]
): RankedInterviewCandidate[] {
  const keywords = extractKeywords(question);
  const normalizedQuestion = question.trim().toLowerCase();
  const preferredDifficulty = inferPreferredDifficulty(question);

  const scored: RankedInterviewCandidate[] = candidates.map((candidate) => {
    const questionLower = candidate.question.toLowerCase();
    const tagsLower = candidate.tags.map((tag) => tag.toLowerCase());
    const topicLower = candidate.topicTitle.toLowerCase();
    const categoryLower = candidate.categoryTitle.toLowerCase();

    let score = 0;

    if (normalizedQuestion.length > 0 && questionLower.includes(normalizedQuestion)) {
      score += WEIGHTS.questionExact;
    }

    for (const keyword of keywords) {
      if (questionLower.includes(keyword)) score += WEIGHTS.questionKeyword;
      if (tagsLower.some((tag) => tag.includes(keyword))) score += WEIGHTS.tags;
      if (topicLower.includes(keyword)) score += WEIGHTS.topic;
      if (categoryLower.includes(keyword)) score += WEIGHTS.category;
    }

    if (preferredDifficulty && candidate.level.toLowerCase() === preferredDifficulty.toLowerCase()) {
      score += WEIGHTS.difficulty;
    }

    return { ...candidate, score };
  });

  return scored
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_INTERVIEW_RESULTS);
}

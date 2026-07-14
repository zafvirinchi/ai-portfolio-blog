import { InterviewSearchResult, InterviewSourceSummary, RankedInterviewCandidate } from "./interview-types";

// Milestone 3's import engine already folds Experience Level, Important
// Concepts, Common Mistakes, Best Practices and Follow-up Questions into the
// `answer` column as a markdown appendix (see interview-import/question-service.ts
// buildStoredAnswer()) — there are no dedicated DB columns for them. Passing
// `answer` through verbatim therefore already surfaces all of that content to
// PortfolioChain without needing to re-fetch or re-parse it here.
function formatCandidate(candidate: RankedInterviewCandidate, index: number): string {
  const lines = [
    `[${index + 1}] Category: ${candidate.categoryTitle} | Topic: ${candidate.topicTitle} | Difficulty: ${candidate.level}`,
    `Question: ${candidate.question}`,
    `Answer: ${candidate.answer}`,
  ];

  if (candidate.tags.length > 0) {
    lines.push(`Tags: ${candidate.tags.join(", ")}`);
  }

  if (candidate.codeExample) {
    const language = candidate.codeLanguage ?? "";
    lines.push(`Code Example:\n\`\`\`${language}\n${candidate.codeExample}\n\`\`\``);
  }

  return lines.join("\n");
}

function toSourceSummary(candidate: RankedInterviewCandidate): InterviewSourceSummary {
  return {
    category: candidate.categoryTitle,
    topic: candidate.topicTitle,
    question: candidate.question,
    difficulty: candidate.level,
  };
}

/**
 * Formats ranked interview candidates into a single LLM-ready context block
 * for PortfolioChain, plus the UI-facing source summaries. Pure function.
 */
export function buildInterviewContext(ranked: RankedInterviewCandidate[]): InterviewSearchResult {
  const context = ranked.map((candidate, index) => formatCandidate(candidate, index)).join("\n\n---\n\n");
  const sources = ranked.map(toSourceSummary);

  return { context, sources };
}

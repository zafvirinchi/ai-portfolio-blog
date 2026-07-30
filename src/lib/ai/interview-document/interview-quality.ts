import { DocumentQuestion } from "./interview-normalizer";
import { RemovedQuestion } from "./document-validator";

export interface QualityReport {
  /** 0-100 overall extraction quality score. */
  qualityScore: number;
  questionCount: number;
  answerCount: number;
  missingAnswers: number;
  originalAnswers: number;
  generatedAnswers: number;
  duplicateQuestions: number;
  brokenQuestions: number;
}

const WEIGHTS = {
  answerCompleteness: 0.5,
  originalRatio: 0.3,
  cleanliness: 0.2,
} as const;

/**
 * Scores this import batch's extraction quality (0-100) from three
 * signals: how many questions ended up with an answer at all
 * (completeness matters most — a question with no answer is close to
 * useless), how much of that content is the document's own original
 * wording versus AI-generated (originality is a bonus, not a requirement
 * — a generated answer for a genuinely unanswered question is still
 * good), and how noisy the raw extraction was (duplicates/broken
 * fragments relative to what was kept, penalizing a messy source
 * document or a parser that's still over- or under-splitting).
 */
export function computeQualityReport(valid: DocumentQuestion[], removed: RemovedQuestion[]): QualityReport {
  const questionCount = valid.length;
  const originalAnswers = valid.filter((q) => q.answerSource === "ORIGINAL").length;
  const missingAnswers = valid.filter((q) => q.answer.trim().length === 0).length;
  const generatedAnswers = valid.filter((q) => q.answerSource === "GENERATED" && q.answer.trim().length > 0).length;
  const answerCount = questionCount - missingAnswers;
  const duplicateQuestions = removed.filter((r) => r.reason === "duplicate").length;
  const brokenQuestions = removed.filter((r) => r.reason === "broken").length;

  if (questionCount === 0) {
    return {
      qualityScore: 0,
      questionCount: 0,
      answerCount: 0,
      missingAnswers: 0,
      originalAnswers: 0,
      generatedAnswers: 0,
      duplicateQuestions,
      brokenQuestions,
    };
  }

  const answerCompleteness = answerCount / questionCount;
  const originalRatio = originalAnswers / questionCount;
  const totalSeen = questionCount + duplicateQuestions + brokenQuestions;
  const cleanliness = totalSeen > 0 ? questionCount / totalSeen : 1;

  const score =
    answerCompleteness * WEIGHTS.answerCompleteness +
    originalRatio * WEIGHTS.originalRatio +
    cleanliness * WEIGHTS.cleanliness;

  return {
    qualityScore: Math.round(score * 100),
    questionCount,
    answerCount,
    missingAnswers,
    originalAnswers,
    generatedAnswers,
    duplicateQuestions,
    brokenQuestions,
  };
}

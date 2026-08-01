import { ExactInterviewAnswer } from "@/types/tool-result";
import { InterviewCandidate } from "./interview-types";

/** Lowercases, strips punctuation, and collapses whitespace so trailing "?"/casing/punctuation differences don't defeat an otherwise-identical question. */
function normalizeForExactMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True only when the user's question and the candidate's stored question are
 * the same question, modulo casing/punctuation/whitespace — deliberately
 * strict so a near-verbatim match short-circuits straight to the stored
 * answer (see interview-chat-service.ts), while anything looser still goes
 * through the existing LLM-generation path unchanged.
 */
export function isExactQuestionMatch(userQuestion: string, candidate: InterviewCandidate): boolean {
  const normalizedUser = normalizeForExactMatch(userQuestion);
  const normalizedCandidate = normalizeForExactMatch(candidate.question);

  return normalizedUser.length > 0 && normalizedUser === normalizedCandidate;
}

export function toExactAnswer(candidate: InterviewCandidate): ExactInterviewAnswer {
  return {
    question: candidate.question,
    answer: candidate.answer,
    diagramUrl: candidate.diagramUrl,
    diagramCaption: candidate.diagramCaption,
    codeExample: candidate.codeExample,
    codeLanguage: candidate.codeLanguage,
  };
}

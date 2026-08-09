import { JobDescription } from "../job-description/jd-schema";
import { Resume } from "../resume/resume-schema";
import { evaluateAnswerRaw } from "./evaluation-agent";
import { AnswerEvaluation, AnswerScoreDimensions, DIMENSIONS_BY_TYPE, SessionQuestion } from "./session-schema";

// The public "evaluate this submitted answer" entry point — calls
// evaluation-agent's raw LLM interaction, then deterministically computes
// the single weighted overallScore from only the dimensions relevant to
// this question's type (mirrors how prep-service.ts composes a raw LLM
// result into a richer final type).

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function weightedOverallScore(dimensions: AnswerScoreDimensions, type: SessionQuestion["type"]): number {
  const relevant = DIMENSIONS_BY_TYPE[type];
  const scored = relevant.map((dimension) => dimensions[dimension]).filter((value): value is number => typeof value === "number");

  if (scored.length > 0) {
    return clamp(Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length));
  }

  // Defensive fallback — the model didn't score any of the dimensions we
  // asked it to; average whatever it did score rather than reporting 0.
  const anyScored = Object.values(dimensions).filter((value): value is number => typeof value === "number");
  if (anyScored.length === 0) return 0;

  return clamp(Math.round(anyScored.reduce((sum, value) => sum + value, 0) / anyScored.length));
}

export async function evaluateAnswer(
  question: SessionQuestion,
  answerText: string,
  resume: Resume,
  jd: JobDescription
): Promise<AnswerEvaluation> {
  const raw = await evaluateAnswerRaw(question, answerText, resume, jd);
  const overallScore = weightedOverallScore(raw.dimensions, question.type);

  return { ...raw, overallScore };
}

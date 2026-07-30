import { DocumentQuestion } from "./interview-normalizer";

export interface RemovedQuestion {
  question: string;
  reason: "duplicate" | "broken";
}

export interface ValidationResult {
  valid: DocumentQuestion[];
  removed: RemovedQuestion[];
}

const LOG_PREFIX = "[interview-document]";

// Whitespace/case/trailing-punctuation-insensitive comparison — same rule
// interview-import/duplicate-detector.ts already uses for the DB-level
// dedup pass, applied here one stage earlier so an obviously duplicate
// question never even reaches Admin Review.
function normalizeForComparison(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.!?,:;]+$/, "")
    .replace(/\s+/g, " ");
}

const MIN_QUESTION_LENGTH = 6;

function isBrokenQuestion(question: string): boolean {
  const trimmed = question.trim();

  if (trimmed.length < MIN_QUESTION_LENGTH) return true;
  if (!/[a-zA-Z]/.test(trimmed)) return true;

  return false;
}

// Conservative OCR-artifact cleanup: collapses runs of 4+ single letters
// each separated by a lone space ("T h i s  i s") back into words, and
// tidies up repeated whitespace and stray spacing before punctuation —
// all reversible, none of it touches genuine short-word sequences (a run
// of 3 or fewer single letters is left alone, since "a b c" style content
// legitimately occurs in code/lists).
function fixOcrSpacing(text: string): string {
  return text
    .replace(/\b(?:[A-Za-z]\s){3,}[A-Za-z]\b/g, (match) => match.replace(/\s+/g, ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

/**
 * Final cleanup pass before Admin Review: fixes OCR/spacing artifacts,
 * drops exact-duplicate questions (case/whitespace/punctuation-
 * insensitive, scoped per topic+category so the same question phrased
 * identically under two different topics is kept), and drops questions
 * too short or too garbled to be usable.
 */
export function validateQuestions(questions: DocumentQuestion[]): ValidationResult {
  const seen = new Set<string>();
  const valid: DocumentQuestion[] = [];
  const removed: RemovedQuestion[] = [];

  for (const question of questions) {
    const cleaned: DocumentQuestion = {
      ...question,
      question: fixOcrSpacing(question.question),
      answer: fixOcrSpacing(question.answer),
    };

    if (isBrokenQuestion(cleaned.question)) {
      removed.push({ question: cleaned.question, reason: "broken" });
      continue;
    }

    const dedupeKey = `${cleaned.category}::${cleaned.topic}::${normalizeForComparison(cleaned.question)}`;

    if (seen.has(dedupeKey)) {
      removed.push({ question: cleaned.question, reason: "duplicate" });
      continue;
    }

    seen.add(dedupeKey);
    valid.push(cleaned);
  }

  console.log(`${LOG_PREFIX} Validation Completed`, {
    valid: valid.length,
    removedDuplicates: removed.filter((r) => r.reason === "duplicate").length,
    removedBroken: removed.filter((r) => r.reason === "broken").length,
  });

  return { valid, removed };
}

import { ExtractedQuestionBlock } from "./interview-types";

interface QuestionMatch {
  text: string;
  confidence: number;
}

// Explicit markers, checked in order — each captures the question text
// after stripping its own prefix. All share the "Question detected"
// confidence anchor (0.97) — 0.98 is reserved for Clear Heading detection
// (topic-detector.ts), so a question, however explicitly marked, never
// outranks a heading's confidence.
const QUESTION_DETECTED_CONFIDENCE = 0.97;

const EXPLICIT_PATTERNS: RegExp[] = [
  /^\s*question\s*:\s*(.+)$/i,
  /^\s*q\s*:\s*(.+)$/i,
  /^\s*q\d+\s*[:.)]\s*(.+)$/i,
  /^\s*q\d+\s+(.+)$/i,
  /^\s*\d+[.)]\s+(.+)$/,
  /^\s*[•\-*]\s+(.+)$/,
];

const INTERROGATIVE_KEYWORDS = [
  "what",
  "why",
  "when",
  "where",
  "explain",
  "describe",
  "difference",
  "define",
  "how",
  "list",
];

const INTERROGATIVE_PATTERN = new RegExp(`^\\s*(${INTERROGATIVE_KEYWORDS.join("|")})\\b`, "i");

function matchExplicitQuestion(line: string): QuestionMatch | undefined {
  for (const pattern of EXPLICIT_PATTERNS) {
    const match = line.match(pattern);

    if (match && match[1]?.trim()) {
      return { text: match[1].trim(), confidence: QUESTION_DETECTED_CONFIDENCE };
    }
  }

  return undefined;
}

// A line with no explicit marker can still be a plain interview question —
// e.g. "Explain the difference between HashMap and TreeMap" with no "Q:"
// in front. A recognized interrogative keyword (What/Why/Explain/etc.) is
// treated as a confidently inferred question (Heading inferred's 0.85
// anchor, reused here — both represent "no explicit marker, but a strong
// structural signal"); a bare trailing "?" with no such keyword is the
// Ambiguous case (0.50).
function matchPlainQuestion(line: string): QuestionMatch | undefined {
  const trimmed = line.trim();

  if (!trimmed) {
    return undefined;
  }

  const startsWithKeyword = INTERROGATIVE_PATTERN.test(trimmed);
  const endsWithQuestionMark = trimmed.endsWith("?");

  if (startsWithKeyword) {
    return { text: trimmed, confidence: 0.85 };
  }

  if (endsWithQuestionMark) {
    return { text: trimmed, confidence: 0.5 };
  }

  return undefined;
}

/**
 * Walks the document line by line, extracting question/answer pairs.
 * `claimedLineIndexes` (topic headings and ignorable noise, detected
 * separately by topic-detector.ts) close out whatever question is
 * currently open and are otherwise skipped — this is what keeps a
 * question's answer text from bleeding into the next section.
 *
 * Any text that isn't recognized as a question is treated as the answer
 * to the most recently opened question; if a question has no such text
 * before the next question/heading, its answer is an empty string (per
 * spec: missing answers stay empty, never invented).
 */
export function extractQuestions(
  lines: string[],
  claimedLineIndexes: ReadonlySet<number>
): ExtractedQuestionBlock[] {
  const blocks: ExtractedQuestionBlock[] = [];

  // 1-indexed, per spec: "Question 1 -> Order = 1".
  let order = 1;
  let current: { question: string; answerLines: string[]; lineIndex: number; confidence: number } | null =
    null;

  function closeCurrent() {
    if (current && current.question.trim()) {
      blocks.push({
        question: current.question.trim(),
        answer: current.answerLines.join(" ").replace(/\s+/g, " ").trim(),
        lineIndex: current.lineIndex,
        order: order++,
        confidence: current.confidence,
      });
    }

    current = null;
  }

  lines.forEach((rawLine, lineIndex) => {
    if (claimedLineIndexes.has(lineIndex)) {
      closeCurrent();
      return;
    }

    const line = rawLine.trim();

    if (!line) {
      return;
    }

    const matched = matchExplicitQuestion(line) ?? matchPlainQuestion(line);

    if (matched) {
      closeCurrent();
      current = { question: matched.text, answerLines: [], lineIndex, confidence: matched.confidence };
      return;
    }

    if (current) {
      current.answerLines.push(line);
    }
  });

  closeCurrent();

  return blocks;
}

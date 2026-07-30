import { LayoutLine } from "./layout-parser";

// Same confidence language as the rest of the extraction pipeline: an
// explicit marker is as certain as detection gets; a keyword-led question
// mark is a confident inference; a bare trailing "?" with no keyword is
// the ambiguous case.
const EXPLICIT_MARKER_CONFIDENCE = 0.97;
const KEYWORD_QUESTION_CONFIDENCE = 0.85;
const AMBIGUOUS_QUESTION_CONFIDENCE = 0.5;

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

export interface DetectedQuestion {
  question: string;
  startLineIndex: number;
  endLineIndex: number;
  confidence: number;
  order: number;
}

interface QuestionMatch {
  confidence: number;
}

function matchPlainQuestion(content: string): QuestionMatch | undefined {
  // Requires a trailing "?" — a long answer paragraph inevitably contains
  // wrapped continuation lines that happen to start with "how"/"what"/
  // "explain"/etc. purely by coincidence of where the PDF wraps; those
  // fragments essentially never end with "?" themselves, since the wrap
  // point is arbitrary relative to punctuation, so requiring it filters
  // them out without losing genuine unmarked questions.
  if (!content.trim() || !content.endsWith("?")) {
    return undefined;
  }

  const startsWithKeyword = INTERROGATIVE_PATTERN.test(content);

  return { confidence: startsWithKeyword ? KEYWORD_QUESTION_CONFIDENCE : AMBIGUOUS_QUESTION_CONFIDENCE };
}

/**
 * Detects interview questions from a layout line stream.
 *
 * Q:/Question:/Interview Question:/Q1: are unambiguous and always count,
 * with or without a trailing "?" — nobody uses that phrasing for anything
 * but a question. Numbered/bulleted lines are structurally ambiguous (a
 * numbered list is just as often procedural steps or a best-practices
 * bullet *inside* an answer) and only count when their content also ends
 * in "?"; otherwise answer-detector.ts picks them up as ordinary list
 * content. Unmarked lines use the same trailing-"?" heuristic, for the
 * same reason: a wrapped mid-paragraph continuation essentially never
 * ends with "?" itself, since the wrap point is arbitrary relative to
 * punctuation.
 *
 * Handles the compound multi-sentence case explicitly: "What is Angular?"
 * immediately followed, on the very next source line, by "How does it
 * work?" — with no marker on the second line and nothing between them —
 * is one question, not two. The signal is line adjacency: an unmarked
 * question-like line that immediately follows the *previous detected
 * question's* last line (no answer content, no blank line, no other
 * question in between) extends that question instead of starting a new
 * one. Any marker (Q:/number/bullet) on the second line always wins and
 * starts a new question regardless of adjacency — a deliberate marker is
 * the strongest signal an author can give that they mean two questions.
 */
export function detectQuestions(lines: LayoutLine[]): DetectedQuestion[] {
  const results: DetectedQuestion[] = [];
  let order = 1;

  for (const line of lines) {
    let matched: QuestionMatch | undefined;

    if (line.hasQuestionMarker) {
      matched = line.content.trim() ? { confidence: EXPLICIT_MARKER_CONFIDENCE } : undefined;
    } else if (line.isListItem) {
      matched = matchPlainQuestion(line.content);
    } else {
      matched = matchPlainQuestion(line.content);
    }

    if (!matched) {
      continue;
    }

    const isMarked = line.hasQuestionMarker || line.isListItem;
    const previous = results[results.length - 1];
    const isCompoundContinuation =
      previous !== undefined && !isMarked && line.lineIndex === previous.endLineIndex + 1;

    if (isCompoundContinuation) {
      previous.question = `${previous.question} ${line.content.trim()}`.trim();
      previous.endLineIndex = line.lineIndex;
      previous.confidence = Math.max(previous.confidence, matched.confidence);
      continue;
    }

    results.push({
      question: line.content.trim(),
      startLineIndex: line.lineIndex,
      endLineIndex: line.lineIndex,
      confidence: matched.confidence,
      order: order++,
    });
  }

  return results;
}

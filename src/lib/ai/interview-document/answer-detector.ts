import { LayoutLine } from "./layout-parser";
import { DetectedQuestion } from "./question-detector";
import { isKnownTopicHeading } from "./topic-detector";

export interface DetectedAnswer {
  /** Index into the questions array this answer belongs to. */
  questionIndex: number;
  answer: string;
  hasOriginalAnswer: boolean;
}

const BULLET_LINE = /^\s*[•\-*]\s+/;
const NUMBERED_LINE = /^\s*\d+[.)]\s+/;
const CODE_LINE = /[{};]\s*$|^\s*(const|let|var|function|class|public|private|import|export|return|def |if\s*\(|for\s*\(|@\w+)/;
const TABLE_LINE = /\|.*\|/;

type LineKind = "bullet" | "code" | "table" | "prose";

function classifyLine(text: string): LineKind {
  if (TABLE_LINE.test(text)) return "table";
  if (CODE_LINE.test(text)) return "code";
  if (BULLET_LINE.test(text) || NUMBERED_LINE.test(text)) return "bullet";
  return "prose";
}

/**
 * Groups consecutive same-kind lines and renders each group appropriately
 * instead of flattening everything into one run-on line — a bullet list
 * stays a bullet list, a code-shaped block stays fenced and line-broken,
 * a table-ish block keeps its line breaks, and ordinary prose is rejoined
 * into flowing sentences (undoing the PDF's wrap points, not the
 * author's).
 */
function renderAnswer(lines: string[]): string {
  const groups: { kind: LineKind; lines: string[] }[] = [];

  for (const line of lines) {
    const kind = classifyLine(line);
    const last = groups[groups.length - 1];

    if (last && last.kind === kind) {
      last.lines.push(line);
    } else {
      groups.push({ kind, lines: [line] });
    }
  }

  return groups
    .map((group) => {
      if (group.kind === "prose") {
        return group.lines.join(" ").replace(/\s+/g, " ").trim();
      }

      if (group.kind === "code") {
        return "```\n" + group.lines.join("\n") + "\n```";
      }

      // bullet / table: preserve one line per item verbatim.
      return group.lines.join("\n");
    })
    .join("\n\n")
    .trim();
}

/**
 * For each detected question, collects every line up to the next question
 * (or the next *known* topic heading — see topic-detector.ts's
 * isKnownTopicHeading) as its answer. Sub-section labels that are NOT
 * known topics — "Answer", "Explanation", "Example", "Advantages",
 * "Disadvantages", "Notes", "Best Practices", "Common Mistakes" — are
 * exactly the kind of line this lets through rather than treating as a
 * boundary: they're part of the same answer, per spec, not a new section.
 */
export function detectAnswers(lines: LayoutLine[], questions: DetectedQuestion[]): DetectedAnswer[] {
  return questions.map((question, index) => {
    const nextQuestion = questions[index + 1];
    const rangeEndLineIndex = nextQuestion ? nextQuestion.startLineIndex : Number.POSITIVE_INFINITY;

    const answerLines: string[] = [];

    for (const line of lines) {
      if (line.lineIndex <= question.endLineIndex) continue;
      if (line.lineIndex >= rangeEndLineIndex) break;
      if (isKnownTopicHeading(line)) break;

      // The *unstripped* text, not `line.content` — list markers
      // (bullets/numbers) are stripped from `content` for question-text
      // purposes, but an answer's own bullet list needs its markers
      // intact for renderAnswer() to recognize and preserve it as one.
      answerLines.push(line.text);
    }

    const answer = renderAnswer(answerLines);

    return {
      questionIndex: index,
      answer,
      hasOriginalAnswer: answer.length > 0,
    };
  });
}

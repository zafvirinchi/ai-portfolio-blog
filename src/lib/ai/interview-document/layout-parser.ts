import { extractDocumentText } from "../interview/document-extractor";
import { isIgnorableLine } from "../interview/topic-detector";
import { InterviewUploadInput } from "../interview/interview-types";
import { loadDocument } from "../ingestion/document-loader";
import { extractPdfWithPages } from "./pdf-page-parser";

// Q:/Question:/Interview Question:/Q1: are unambiguous — nobody writes
// those to label an answer's own bullet list, so they're always a
// question regardless of what follows.
const QUESTION_MARKER_PATTERNS: { pattern: RegExp; strip: RegExp }[] = [
  { pattern: /^\s*interview\s*question\s*:\s*\S/i, strip: /^\s*interview\s*question\s*:\s*/i },
  { pattern: /^\s*question\s*:\s*\S/i, strip: /^\s*question\s*:\s*/i },
  { pattern: /^\s*q\s*:\s*\S/i, strip: /^\s*q\s*:\s*/i },
  { pattern: /^\s*q\d+\s*[:.)]\s*\S/i, strip: /^\s*q\d+\s*[:.)]\s*/i },
  { pattern: /^\s*q\d+\s+\S/i, strip: /^\s*q\d+\s+/i },
];

// Numbered/bulleted lines are structurally list items, but NOT an
// unambiguous question signal on their own — a numbered/bulleted list is
// just as often a procedural step or a best-practices bullet *inside* an
// answer as it is a numbered list of top-level questions. question-
// detector.ts only treats one of these as a new question when its content
// also ends in "?"; otherwise it's answer content, preserved as a list
// item by answer-detector.ts.
const LIST_ITEM_PATTERNS: { pattern: RegExp; strip: RegExp }[] = [
  { pattern: /^\s*\d+[.)]\s+\S/, strip: /^\s*\d+[.)]\s+/ },
  { pattern: /^\s*[•\-*]\s+\S/, strip: /^\s*[•\-*]\s+/ },
];

export interface LayoutLine {
  /** Original line text, trimmed. */
  text: string;
  /** Line index in the normalized document text — the source of truth for adjacency/gaps. */
  lineIndex: number;
  /** Q:/Question:/Interview Question:/Q1: — unambiguous, always a question. */
  hasQuestionMarker: boolean;
  /** Numbered ("1.") or bulleted ("-") — a list item, ambiguous as a question on its own. */
  isListItem: boolean;
  /** `text` with any matched marker prefix stripped; otherwise equal to `text`. */
  content: string;
  /** 1-based PDF page this line came from. Always 1 for non-PDF formats (DOCX/TXT have no page concept here). */
  pageNumber: number;
}

/** 1-based page number of the page containing `lineIndex`, given each page's starting line index (ascending, 0-based). Defaults to page 1 when `pageStartLines` is empty (non-PDF documents). */
function resolvePageNumber(lineIndex: number, pageStartLines: number[]): number {
  let page = 1;

  for (let i = 0; i < pageStartLines.length; i++) {
    if (pageStartLines[i] > lineIndex) break;
    page = i + 1;
  }

  return page;
}

function matchMarker(
  line: string,
  patterns: { pattern: RegExp; strip: RegExp }[]
): { content: string } | undefined {
  for (const { pattern, strip } of patterns) {
    if (pattern.test(line)) {
      return { content: line.replace(strip, "").trim() };
    }
  }

  return undefined;
}

/**
 * Normalizes raw document text into a filtered, marker-tagged line stream
 * — front-matter noise (page numbers, table of contents, ...) and blank
 * lines are dropped, and every remaining line is tagged with whether it
 * opens with an explicit question marker. This is deliberately a *line*
 * stream, not pre-merged paragraphs: pdf-parse text rarely has a blank
 * line between a question and its answer, so merging on structural cues
 * alone would just as often glue a question to its own answer as it would
 * separate one question from the next. Reconstructing paragraphs — "which
 * lines belong to this question", "which lines belong to this answer" —
 * needs question/answer awareness, which is exactly what
 * question-detector.ts and answer-detector.ts add on top of this.
 *
 * `lineIndex` is preserved from the original (unfiltered) text on purpose:
 * downstream stages use gaps in it (e.g. two lines that were NOT actually
 * adjacent in the source, because a blank line separated them) to tell a
 * genuine paragraph break apart from a same-breath continuation.
 */
export function parseLayout(rawText: string, pageStartLines: number[] = []): LayoutLine[] {
  const rawLines = rawText.split("\n");
  const lines: LayoutLine[] = [];

  rawLines.forEach((rawLine, lineIndex) => {
    const trimmed = rawLine.trim();

    if (!trimmed || isIgnorableLine(trimmed)) {
      return;
    }

    const questionMarker = matchMarker(trimmed, QUESTION_MARKER_PATTERNS);
    const listMarker = questionMarker ? undefined : matchMarker(trimmed, LIST_ITEM_PATTERNS);

    lines.push({
      text: trimmed,
      lineIndex,
      hasQuestionMarker: questionMarker !== undefined,
      isListItem: listMarker !== undefined,
      content: questionMarker?.content ?? listMarker?.content ?? trimmed,
      pageNumber: resolvePageNumber(lineIndex, pageStartLines),
    });
  });

  return lines;
}

/**
 * Loads and parses an uploaded interview document straight into a layout
 * line stream. PDFs go through the page-aware extractor (pdf-page-parser.ts)
 * so every line is tagged with the PDF page it came from — needed to
 * associate extracted diagrams (pdf-image-extractor.ts) with the question
 * they illustrate. DOCX/TXT have no page concept here, so every line
 * defaults to page 1.
 */
export async function parseDocumentLayout(input: InterviewUploadInput): Promise<LayoutLine[]> {
  const loaded = loadDocument(input);

  if (loaded.format === "pdf") {
    const { text, pageStartLines } = await extractPdfWithPages(loaded.buffer);

    if (!text) {
      throw new Error(`No extractable text found in "${input.filename}".`);
    }

    return parseLayout(text, pageStartLines);
  }

  const text = await extractDocumentText(input);
  return parseLayout(text);
}

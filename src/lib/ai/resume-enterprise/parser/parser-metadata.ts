import { ResumeParserConfidence } from "../resume-schema";
import { DetectedSection, ParserMetadata } from "./parser-types";

const PARSER_VERSION = "1.0.0";
const WORDS_PER_PAGE_ESTIMATE = 500;

export function buildParserMetadata(
  rawText: string,
  sections: DetectedSection[],
  processingTimeMs: number,
  confidence: ResumeParserConfidence
): ParserMetadata {
  const totalWords = rawText.trim() ? rawText.trim().split(/\s+/).filter(Boolean).length : 0;

  return {
    parserVersion: PARSER_VERSION,
    processingTime: processingTimeMs,
    confidence: confidence.overall,
    // No language-detection library in this project — a fixed default,
    // not a real detection result. Documented rather than implied.
    documentLanguage: "en",
    sectionCount: sections.length,
    // Word-count-based proxy — same documented caveat the ATS engine uses
    // for "very long resume" (no raw page/layout data at this stage).
    pageCount: Math.max(1, Math.ceil(totalWords / WORDS_PER_PAGE_ESTIMATE)),
    totalWords,
    resumeLength: rawText.length,
  };
}

import { loadDocument } from "../ingestion/document-loader";
import { parseDocument, normalizeText } from "../ingestion/document-parser";
import { InterviewUploadInput } from "./interview-types";

// Interview documents support PDF/DOCX/TXT only — Markdown (which the
// shared loader also detects) is explicitly rejected here, along with
// anything the loader doesn't recognize at all (images, Excel, CSV, etc.,
// which never resolve to a SupportedDocumentFormat and already throw from
// loadDocument()).
const SUPPORTED_INTERVIEW_FORMATS = new Set(["pdf", "docx", "txt"]);

const LOG_PREFIX = "[interview-extractor]";

/**
 * Loads and parses an uploaded interview document into normalized plain
 * text. Reuses the Phase 6 Knowledge Ingestion Pipeline's document loader
 * and parser (loadDocument, parseDocument, normalizeText) verbatim — no
 * PDF/DOCX/TXT parsing logic is duplicated here.
 */
export async function extractDocumentText(input: InterviewUploadInput): Promise<string> {
  console.log(`${LOG_PREFIX} Loading Document`, { filename: input.filename });

  const loaded = loadDocument(input);

  if (!SUPPORTED_INTERVIEW_FORMATS.has(loaded.format)) {
    throw new Error(
      `Unsupported interview document format "${loaded.format}". Supported formats: PDF, DOCX, TXT.`
    );
  }

  console.log(`${LOG_PREFIX} Parsing Text`, { filename: input.filename, format: loaded.format });

  const parsed = await parseDocument(loaded);

  console.log(`${LOG_PREFIX} Normalizing`, { filename: input.filename });

  const normalized = normalizeText(parsed.text);

  if (!normalized) {
    throw new Error(`No extractable text found in "${input.filename}".`);
  }

  return normalized;
}

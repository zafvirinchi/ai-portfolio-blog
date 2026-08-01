import mammoth from "mammoth";
import matter from "gray-matter";

import { LoadedDocument } from "./document-loader";

export interface ParsedDocument {
  text: string;
  /** Markdown frontmatter, if any (e.g. `---\ntitle: ...\n---`). */
  frontmatter?: Record<string, unknown>;
}

async function parsePdf(buffer: Buffer): Promise<string> {
  // Dynamically imported (not top-level) so pdf-parse/pdfjs-dist — which
  // needs browser-only APIs (DOMMatrix) not present in every Node runtime
  // (e.g. Vercel serverless) — only loads when a PDF is actually being
  // parsed. This module's other exports (normalizeText) are pulled in
  // eagerly by resume-parser.ts, which is itself eagerly imported by every
  // chat request via tools/registry.ts -> resume.tool.ts -> resume/index.ts
  // -> resume-parser.ts — a top-level `import { PDFParse } from "pdf-parse"`
  // here previously crashed every single chat message on Vercel, not just
  // PDF uploads.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function parseMarkdown(buffer: Buffer): ParsedDocument {
  const { content, data } = matter(buffer.toString("utf-8"));
  return { text: content, frontmatter: data };
}

function parsePlainText(buffer: Buffer): string {
  return buffer.toString("utf-8");
}

/** Extracts raw text from a loaded document using a format-appropriate library. */
export async function parseDocument(document: LoadedDocument): Promise<ParsedDocument> {
  switch (document.format) {
    case "pdf":
      return { text: await parsePdf(document.buffer) };
    case "docx":
      return { text: await parseDocx(document.buffer) };
    case "md":
      return parseMarkdown(document.buffer);
    case "txt":
      return { text: parsePlainText(document.buffer) };
    default: {
      const exhaustiveCheck: never = document.format;
      throw new Error(`Unhandled document format: ${exhaustiveCheck}`);
    }
  }
}

const NULL_CHARACTER = String.fromCharCode(0);

/**
 * Collapses extraction artifacts (CRLF line endings, null bytes, repeated
 * whitespace/blank lines) into clean text before chunking.
 */
export function normalizeText(rawText: string): string {
  return rawText
    .split(NULL_CHARACTER)
    .join("")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

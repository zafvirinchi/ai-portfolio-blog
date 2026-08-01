import { PDFParse } from "pdf-parse";
import { normalizeText } from "../ingestion/document-parser";

export interface PdfPageExtraction {
  text: string;
  /** 0-based line index (into `text.split("\n")`) each page starts at — `pageStartLines[i]` is where page `i + 1` begins. */
  pageStartLines: number[];
}

/**
 * Page-aware PDF text extraction for the interview pipeline only — kept
 * separate from ingestion/document-parser.ts's parsePdf() (used by the
 * generic Knowledge Manager/RAG ingestion path) so this doesn't risk
 * changing behavior there. Each page's text is normalized independently
 * (the same normalizeText() the generic path uses) before joining, so line
 * counts per page stay accurate and pageStartLines can be trusted by
 * layout-parser.ts to stamp a pageNumber on every LayoutLine.
 */
export async function extractPdfWithPages(buffer: Buffer): Promise<PdfPageExtraction> {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const lines: string[] = [];
    const pageStartLines: number[] = [];

    for (const page of result.pages) {
      pageStartLines.push(lines.length);

      const normalized = normalizeText(page.text);

      if (normalized) {
        lines.push(...normalized.split("\n"));
      }
    }

    return { text: lines.join("\n"), pageStartLines };
  } finally {
    await parser.destroy();
  }
}

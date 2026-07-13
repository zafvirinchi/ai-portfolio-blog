export type SupportedDocumentFormat = "pdf" | "docx" | "txt" | "md";

export interface RawFileInput {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
}

export interface LoadedDocument {
  filename: string;
  format: SupportedDocumentFormat;
  buffer: Buffer;
}

export class UnsupportedDocumentFormatError extends Error {
  constructor(filename: string) {
    super(
      `Unsupported document format for file "${filename}". Supported formats: pdf, docx, txt, md.`
    );
    this.name = "UnsupportedDocumentFormatError";
  }
}

const EXTENSION_FORMAT_MAP: Record<string, SupportedDocumentFormat> = {
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
  md: "md",
  markdown: "md",
};

export function detectFormat(filename: string): SupportedDocumentFormat {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const format = EXTENSION_FORMAT_MAP[extension];

  if (!format) {
    throw new UnsupportedDocumentFormatError(filename);
  }

  return format;
}

/**
 * Normalizes a raw upload (filename + bytes) into a typed, format-detected
 * document. This is the "Upload" step of the ingestion pipeline — it does
 * not extract any text yet, see document-parser.ts for that.
 */
export function loadDocument(input: RawFileInput): LoadedDocument {
  if (!input.buffer || input.buffer.length === 0) {
    throw new Error(`File "${input.filename}" is empty.`);
  }

  return {
    filename: input.filename,
    format: detectFormat(input.filename),
    buffer: input.buffer,
  };
}

/**
 * Converts a Web API File/Blob (e.g. from a Next.js route handler's
 * `request.formData()`) into the Buffer-based RawFileInput this pipeline
 * operates on, so a future upload API route can call this before `ingest()`.
 */
export async function fromWebFile(file: File): Promise<RawFileInput> {
  const arrayBuffer = await file.arrayBuffer();

  return {
    filename: file.name,
    buffer: Buffer.from(arrayBuffer),
    mimeType: file.type || undefined,
  };
}

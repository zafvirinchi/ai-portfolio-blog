import { loadDocument, RawFileInput } from "./document-loader";
import { parseDocument, normalizeText } from "./document-parser";
import { chunkDocument, ChunkerConfig } from "./chunker";
import { embeddingService } from "./embedding-service";
import { knowledgeWriter, EmbeddedChunk } from "./knowledge-writer";

const DEFAULT_DOCUMENT_TYPE = "upload";

export interface IngestFileInput extends RawFileInput {
  /** Defaults to the filename if omitted. */
  title?: string;
  /** Defaults to "upload"; matches the free-text `document_type` column used by the manual RAG document form. */
  documentType?: string;
  /** Defaults to the filename if omitted. */
  sourceRef?: string;
  chunkSize?: ChunkerConfig["chunkSize"];
  chunkOverlap?: ChunkerConfig["chunkOverlap"];
  /** Extra metadata merged onto every chunk's in-memory metadata (see chunker.ts). */
  metadata?: Record<string, unknown>;
}

export interface IngestionResult {
  success: boolean;
  documentId: string | null;
  chunkCount: number;
  embeddingCount: number;
  processingTimeMs: number;
  errors: string[];
}

function buildResult(
  startedAt: number,
  overrides: Partial<IngestionResult> & { errors: string[] }
): IngestionResult {
  return {
    success: overrides.documentId != null && overrides.errors.length === 0,
    documentId: null,
    chunkCount: 0,
    embeddingCount: 0,
    ...overrides,
    processingTimeMs: Date.now() - startedAt,
  };
}

/**
 * Knowledge Ingestion Pipeline:
 *   Upload -> Extract -> Normalize -> Chunk -> Embedding -> Store -> Done
 *
 * Nothing is written to Supabase until chunking and embedding have both
 * succeeded in memory, so a failed ingestion never leaves an orphaned
 * `rag_documents` row with zero chunks.
 */
export class KnowledgeIngestionService {
  async ingest(file: IngestFileInput): Promise<IngestionResult> {
    const startedAt = Date.now();
    const errors: string[] = [];

    try {
      // Upload
      const loaded = loadDocument(file);

      // Extract
      const parsed = await parseDocument(loaded);

      // Normalize
      const normalized = normalizeText(parsed.text);

      if (!normalized) {
        errors.push(`No extractable text found in "${loaded.filename}".`);
        return buildResult(startedAt, { errors });
      }

      const title = file.title?.trim() || loaded.filename;

      // Chunk
      const chunks = await chunkDocument({
        text: normalized,
        documentTitle: title,
        sourceFilename: loaded.filename,
        config: { chunkSize: file.chunkSize, chunkOverlap: file.chunkOverlap },
        metadata: { ...parsed.frontmatter, ...file.metadata },
      });

      if (chunks.length === 0) {
        errors.push(`Document "${loaded.filename}" produced no chunks after chunking.`);
        return buildResult(startedAt, { errors });
      }

      // Embedding
      const embeddings = await embeddingService.embedBatch(chunks.map((chunk) => chunk.text));

      const embeddedChunks: EmbeddedChunk[] = chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index],
      }));

      // Store
      const documentId = await knowledgeWriter.writeDocument({
        title,
        documentType: file.documentType ?? DEFAULT_DOCUMENT_TYPE,
        sourceRef: file.sourceRef ?? loaded.filename,
        content: normalized,
      });

      const chunkCount = await knowledgeWriter.writeChunks(documentId, embeddedChunks);

      // Done
      return buildResult(startedAt, {
        documentId,
        chunkCount,
        embeddingCount: embeddedChunks.length,
        errors,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown ingestion error");
      return buildResult(startedAt, { errors });
    }
  }
}

export const knowledgeIngestionService = new KnowledgeIngestionService();

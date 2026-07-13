import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export interface ChunkerConfig {
  chunkSize: number;
  chunkOverlap: number;
}

export const DEFAULT_CHUNKER_CONFIG: ChunkerConfig = {
  chunkSize: 1000,
  chunkOverlap: 150,
};

export interface ChunkMetadata {
  documentTitle: string;
  sourceFilename: string;
  chunkIndex: number;
  charCount: number;
  [key: string]: unknown;
}

export interface Chunk {
  text: string;
  index: number;
  metadata: ChunkMetadata;
}

export interface ChunkDocumentInput {
  text: string;
  documentTitle: string;
  sourceFilename: string;
  config?: Partial<ChunkerConfig>;
  metadata?: Record<string, unknown>;
}

function resolveConfig(config?: Partial<ChunkerConfig>): ChunkerConfig {
  const chunkSize = config?.chunkSize ?? DEFAULT_CHUNKER_CONFIG.chunkSize;
  const chunkOverlap = config?.chunkOverlap ?? DEFAULT_CHUNKER_CONFIG.chunkOverlap;

  if (chunkSize <= 0) {
    throw new Error("chunkSize must be greater than 0");
  }

  if (chunkOverlap < 0 || chunkOverlap >= chunkSize) {
    throw new Error("chunkOverlap must be >= 0 and smaller than chunkSize");
  }

  return { chunkSize, chunkOverlap };
}

/**
 * Splits normalized document text into overlapping chunks and attaches
 * metadata (document title, source filename, chunk position, plus any
 * caller-supplied metadata) to each one. Chunk size/overlap are
 * configurable per call; falls back to DEFAULT_CHUNKER_CONFIG otherwise.
 */
export async function chunkDocument(input: ChunkDocumentInput): Promise<Chunk[]> {
  const config = resolveConfig(input.config);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
  });

  const rawChunks = await splitter.splitText(input.text);

  return rawChunks
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((text, index) => ({
      text,
      index,
      metadata: {
        documentTitle: input.documentTitle,
        sourceFilename: input.sourceFilename,
        chunkIndex: index,
        charCount: text.length,
        ...input.metadata,
      },
    }));
}

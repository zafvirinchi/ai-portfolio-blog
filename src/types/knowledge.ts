export interface KnowledgeDocument {
  id: string;
  title: string;
  document_type: string;
  source_ref: string | null;
  created_at: string;
  chunk_count: number;
}

export interface KnowledgeDocumentDetail extends KnowledgeDocument {
  content: string;
}

export interface KnowledgeStatsSummary {
  totalDocuments: number;
  totalChunks: number;
  totalEmbeddings: number;
  latestUploadAt: string | null;
}

export interface KnowledgeListResponse {
  documents: KnowledgeDocument[];
  stats: KnowledgeStatsSummary;
}

export interface KnowledgeIngestResponse {
  success: boolean;
  documentId: string | null;
  chunkCount: number;
  embeddingCount: number;
  processingTimeMs: number;
  errors: string[];
  document: KnowledgeDocument | null;
}

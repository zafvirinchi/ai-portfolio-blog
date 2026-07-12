export interface ChatMessage {
  role: "user" | "assistant";

  content: string;
}

export interface RagChunk {
  id?: string;

  document_id?: string;

  chunk_text: string;

  similarity?: number;

  metadata?: Record<string, unknown>;
}

export interface SourceDocument {
  content: string;

  metadata?: {
    id?: string;

    similarity?: number;
  };
}

export interface ChatResponse {
  answer: string;

  sources: SourceDocument[];
}
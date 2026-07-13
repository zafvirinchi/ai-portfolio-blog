import { supabaseAdmin } from "@/lib/supabase/admin";

import { Chunk } from "./chunker";

export interface WriteDocumentInput {
  title: string;
  documentType: string;
  sourceRef?: string;
  content: string;
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

/**
 * Persists ingested documents/chunks into the existing `rag_documents` /
 * `rag_document_chunks` tables (same schema the manual RAG document form
 * writes to) so ingested files are retrievable via the existing
 * `match_rag_chunks` RPC without any RAG/retrieval changes.
 */
export class KnowledgeWriter {
  async writeDocument(input: WriteDocumentInput): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("rag_documents")
      .insert({
        title: input.title,
        document_type: input.documentType,
        source_ref: input.sourceRef ?? null,
        content: input.content,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      throw new Error(
        `Failed to write document "${input.title}": ${error?.message ?? "no row returned"}`
      );
    }

    return data.id as string;
  }

  async writeChunks(documentId: string, chunks: EmbeddedChunk[]): Promise<number> {
    if (chunks.length === 0) {
      return 0;
    }

    const rows = chunks.map((chunk) => ({
      document_id: documentId,
      chunk_text: chunk.text,
      embedding: chunk.embedding,
      chunk_index: chunk.index,
    }));

    const { error } = await supabaseAdmin.from("rag_document_chunks").insert(rows);

    if (error) {
      throw new Error(`Failed to write chunks for document "${documentId}": ${error.message}`);
    }

    return rows.length;
  }
}

export const knowledgeWriter = new KnowledgeWriter();

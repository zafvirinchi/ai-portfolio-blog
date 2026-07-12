import { openai } from "@/lib/ai/openai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RagChunk } from "@/types/ai";

const MAX_MATCHES = 15;

export async function searchRagContext(
  query: string
): Promise<RagChunk[]> {
  try {
    if (!query.trim()) {
      return [];
    }

    const embeddingResponse =
      await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      });

    const embedding =
      embeddingResponse.data[0].embedding;

    const { data, error } =
      await supabaseAdmin.rpc(
        "match_rag_chunks",
        {
          query_embedding: embedding,
          match_count: MAX_MATCHES,
        }
      );

    if (error) {
      console.error(error.message);
      return [];
    }

    const chunks =
      (data ?? []) as RagChunk[];

    const uniqueChunks: RagChunk[] =
      Array.from(
        new Map<string, RagChunk>(
          chunks.map((chunk) => [
            chunk.chunk_text,
            chunk,
          ])
        ).values()
      );

    uniqueChunks.sort(
      (a, b) =>
        (b.similarity ?? 0) -
        (a.similarity ?? 0)
    );

    return uniqueChunks;
  } catch (error) {
    console.error(error);
    return [];
  }
}

/**
 * Converts chunks into
 * one clean prompt context
 */

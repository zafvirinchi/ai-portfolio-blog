import { openai } from "../openai";
import { createEmbedding } from "../embeddings";

const EMBEDDING_MODEL = "text-embedding-3-small";

// OpenAI's embeddings endpoint accepts an array `input`; batching keeps us
// well under its per-request item/token limits while avoiding one round
// trip per chunk.
const EMBEDDING_BATCH_SIZE = 100;

export class EmbeddingService {
  /** Embeds a single string. Delegates to the existing shared embedding service. */
  async embed(text: string): Promise<number[]> {
    return createEmbedding(text);
  }

  /**
   * Embeds many chunks using the same OpenAI client/model as `embed()`,
   * batched into as few requests as possible.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const embeddings: number[][] = [];

    for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);

      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      });

      embeddings.push(...response.data.map((item) => item.embedding));
    }

    return embeddings;
  }
}

export const embeddingService = new EmbeddingService();

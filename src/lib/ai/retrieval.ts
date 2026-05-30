import { supabaseAdmin } from "@/lib/supabase/admin";
import { createEmbedding } from "./embeddings";

export async function searchRagContext(question: string) {
  const embedding = await createEmbedding(question);

  const { data, error } = await supabaseAdmin.rpc("match_rag_chunks", {
    query_embedding: embedding,
    match_count: 5,
  });

  if (error) {
    console.error("RAG search error:", error.message);
    return [];
  }

  return data || [];
}
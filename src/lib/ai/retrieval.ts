import { supabaseAdmin } from "@/lib/supabase/admin";
import { createEmbedding } from "./embeddings";

function getSearchTerms(question: string) {
  const q = question.toLowerCase();

  if (q.includes("certification") || q.includes("certified")) {
    return "certifications";
  }

  if (q.includes("project") || q.includes("worked on")) {
    return "projects";
  }

  if (q.includes("skill") || q.includes("technology")) {
    return "skills";
  }

  if (q.includes("who is") || q.includes("about")) {
    return "Zafrul Islam";
  }

  return question;
}

export async function searchRagContext(question: string) {
  const embedding = await createEmbedding(question);
  const queryText = getSearchTerms(question);

  const { data, error } = await supabaseAdmin.rpc("match_rag_chunks", {
    query_embedding: embedding,
    query_text: queryText,
    match_count: 15,
  });

  if (error) {
    console.error("RAG search error:", error.message);
    return [];
  }

  return data || [];
}
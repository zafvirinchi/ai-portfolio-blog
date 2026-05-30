import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createEmbedding } from "@/lib/ai/embeddings";

function chunkText(text: string, chunkSize = 1000, overlap = 150) {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = start + chunkSize;
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }

  return chunks;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { title, document_type, source_ref, content } = body;

    if (!title || !document_type || !content) {
      return NextResponse.json(
        { error: "Title, document type and content are required" },
        { status: 400 }
      );
    }

    const { data: document, error: docError } = await supabaseAdmin
      .from("rag_documents")
      .insert({
        title,
        document_type,
        source_ref,
        content,
      })
      .select()
      .maybeSingle();

    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 400 });
    }

    const chunks = chunkText(content);

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await createEmbedding(chunks[i]);

      const { error: chunkError } = await supabaseAdmin
        .from("rag_document_chunks")
        .insert({
          document_id: document.id,
          chunk_text: chunks[i],
          embedding,
          chunk_index: i,
        });

      if (chunkError) {
        return NextResponse.json(
          { error: chunkError.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      message: "RAG document processed successfully",
      document,
      chunks: chunks.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
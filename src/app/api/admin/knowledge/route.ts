import { NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/billing/admin-api-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fromWebFile } from "@/lib/ai/ingestion/document-loader";
import { knowledgeIngestionService } from "@/lib/ai/ingestion/pipeline";
import { KnowledgeDocument } from "@/types/knowledge";

// POST parses + chunks + embeds an uploaded document — can exceed Vercel's
// default 15s timeout for larger files. Applies to the whole file (GET/
// DELETE are unaffected but cheap enough not to need a separate config).
export const maxDuration = 60;

// PostgREST's `.or()` filter syntax is comma-delimited, so strip characters
// that would let a search term break out of the filter or inject wildcards.
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()%*]/g, " ").trim();
}

async function fetchChunkCounts(documentIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (documentIds.length === 0) {
    return counts;
  }

  const { data, error } = await supabaseAdmin
    .from("rag_document_chunks")
    .select("document_id")
    .in("document_id", documentIds);

  if (error) {
    throw new Error(`Failed to load chunk counts: ${error.message}`);
  }

  for (const row of data ?? []) {
    const documentId = row.document_id as string;
    counts.set(documentId, (counts.get(documentId) ?? 0) + 1);
  }

  return counts;
}

export async function GET(req: Request) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    // Single-document detail (used by the preview card), includes full content.
    if (id) {
      const { data, error } = await supabaseAdmin
        .from("rag_documents")
        .select("id, title, document_type, source_ref, content, created_at")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (!data) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      const chunkCounts = await fetchChunkCounts([id]);

      return NextResponse.json({
        document: { ...data, chunk_count: chunkCounts.get(id) ?? 0 },
      });
    }

    const search = searchParams.get("search")?.trim();

    let query = supabaseAdmin
      .from("rag_documents")
      .select("id, title, document_type, source_ref, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (search) {
      const term = sanitizeSearchTerm(search);
      query = query.or(
        `title.ilike.%${term}%,document_type.ilike.%${term}%,source_ref.ilike.%${term}%,content.ilike.%${term}%`
      );
    }

    const { data: documents, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const chunkCounts = await fetchChunkCounts((documents ?? []).map((doc) => doc.id));

    const [documentCount, chunkCount, latest] = await Promise.all([
      supabaseAdmin.from("rag_documents").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("rag_document_chunks").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("rag_documents")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const result: KnowledgeDocument[] = (documents ?? []).map((doc) => ({
      ...doc,
      chunk_count: chunkCounts.get(doc.id) ?? 0,
    }));

    return NextResponse.json({
      documents: result,
      stats: {
        totalDocuments: documentCount.count ?? 0,
        // Every chunk row is written with a populated embedding vector, so
        // total embeddings and total chunks are always equal in this schema.
        totalChunks: chunkCount.count ?? 0,
        totalEmbeddings: chunkCount.count ?? 0,
        latestUploadAt: latest.data?.created_at ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file is required" }, { status: 400 });
    }

    const title = formData.get("title");
    const documentType = formData.get("documentType");
    const sourceRef = formData.get("sourceRef");

    const raw = await fromWebFile(file);

    const result = await knowledgeIngestionService.ingest({
      ...raw,
      title: typeof title === "string" && title.trim() ? title.trim() : undefined,
      documentType:
        typeof documentType === "string" && documentType.trim() ? documentType.trim() : undefined,
      sourceRef: typeof sourceRef === "string" && sourceRef.trim() ? sourceRef.trim() : undefined,
    });

    if (!result.success || !result.documentId) {
      return NextResponse.json({ ...result, document: null }, { status: 422 });
    }

    const { data: document } = await supabaseAdmin
      .from("rag_documents")
      .select("id, title, document_type, source_ref, created_at")
      .eq("id", result.documentId)
      .maybeSingle();

    return NextResponse.json({
      ...result,
      document: document ? { ...document, chunk_count: result.chunkCount } : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Document id is required" }, { status: 400 });
    }

    const { error: chunkError } = await supabaseAdmin
      .from("rag_document_chunks")
      .delete()
      .eq("document_id", id);

    if (chunkError) {
      return NextResponse.json({ error: chunkError.message }, { status: 400 });
    }

    const { error: docError } = await supabaseAdmin.from("rag_documents").delete().eq("id", id);

    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 400 });
    }

    return NextResponse.json({ message: "Document deleted successfully" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

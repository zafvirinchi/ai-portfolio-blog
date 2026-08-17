import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/billing/admin-api-guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createEmbedding } from "@/lib/ai/embeddings";
import * as activityService from "@/lib/saas/activity-service";
import { checkCredits, consumeCredits } from "@/lib/billing/credit-service";
import { InsufficientCreditsError } from "@/lib/billing/billing-types";
import { getActiveSubscription } from "@/lib/billing/subscription-service";
import { getTenantContext } from "@/lib/saas/tenant-context";
import { usageRequestContext } from "@/lib/ai/usage/usage-context";
import { InsufficientAiCreditsError } from "@/lib/ai/usage/usage-errors";

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
  const guard = await requireAdminRoute();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json();

    const { title, document_type, source_ref, content } = body;

    if (!title || !document_type || !content) {
      return NextResponse.json(
        { error: "Title, document type and content are required" },
        { status: 400 }
      );
    }

    await checkCredits("knowledge_upload");

    const startedAt = Date.now();

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

    // Each chunk is its own embedding call — resolve identity once,
    // then give each call its own requestId so N chunks produce N
    // usage_tracking/credit_transactions rows, not one collapsed row
    // (record() upserts by request_id, so a shared id would under-count).
    const tenantContext = await getTenantContext();
    const subscription = tenantContext ? await getActiveSubscription(tenantContext.organizationId) : null;

    for (let i = 0; i < chunks.length; i++) {
      const embedding = tenantContext
        ? await usageRequestContext.run(
            {
              userId: tenantContext.userId,
              organizationId: tenantContext.organizationId,
              subscriptionId: subscription && !subscription.isImplicitFree ? subscription.id : null,
              feature: "KNOWLEDGE_INGESTION",
              operation: "EMBEDDING",
              requestId: randomUUID(),
            },
            () => createEmbedding(chunks[i])
          )
        : await createEmbedding(chunks[i]);

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

    await consumeCredits("knowledge_upload", Date.now() - startedAt);

    await activityService.record("Knowledge Uploaded", `Uploaded knowledge document: ${title}`, {
      documentId: document.id,
      documentType: document_type,
    });

    return NextResponse.json({
      message: "RAG document processed successfully",
      document,
      chunks: chunks.length,
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError || error instanceof InsufficientAiCreditsError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
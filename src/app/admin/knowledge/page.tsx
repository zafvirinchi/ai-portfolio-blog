"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import KnowledgeStats from "@/components/admin/knowledge/KnowledgeStats";
import KnowledgeUpload from "@/components/admin/knowledge/KnowledgeUpload";
import KnowledgeSearch from "@/components/admin/knowledge/KnowledgeSearch";
import KnowledgeTable from "@/components/admin/knowledge/KnowledgeTable";
import KnowledgeCard from "@/components/admin/knowledge/KnowledgeCard";
import KnowledgeDeleteDialog from "@/components/admin/knowledge/KnowledgeDeleteDialog";
import {
  KnowledgeDocument,
  KnowledgeDocumentDetail,
  KnowledgeIngestResponse,
  KnowledgeStatsSummary,
} from "@/types/knowledge";

const EMPTY_STATS: KnowledgeStatsSummary = {
  totalDocuments: 0,
  totalChunks: 0,
  totalEmbeddings: 0,
  latestUploadAt: null,
};

export default function AdminKnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [stats, setStats] = useState<KnowledgeStatsSummary>(EMPTY_STATS);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<KnowledgeDocumentDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [sessionProcessingTimes, setSessionProcessingTimes] = useState<number[]>([]);

  const loadDocuments = useCallback(async (searchTerm: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : "";
      const response = await fetch(`/api/admin/knowledge${params}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to load knowledge documents");
      }

      setDocuments(result.documents);
      setStats(result.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments(search);
  }, [search, loadDocuments]);

  const averageProcessingTimeMs = useMemo(() => {
    if (sessionProcessingTimes.length === 0) return null;
    const total = sessionProcessingTimes.reduce((sum, value) => sum + value, 0);
    return Math.round(total / sessionProcessingTimes.length);
  }, [sessionProcessingTimes]);

  function handleUploaded(result: KnowledgeIngestResponse) {
    setSessionProcessingTimes((prev) => [...prev, result.processingTimeMs]);
    loadDocuments(search);
  }

  async function handlePreview(doc: KnowledgeDocument) {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewDoc(null);

    try {
      const response = await fetch(`/api/admin/knowledge?id=${doc.id}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to load document");
      }

      setPreviewDoc(result.document);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load document");
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreviewDoc(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      const response = await fetch(`/api/admin/knowledge?id=${deleteTarget.id}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to delete document");
      }

      if (previewDoc?.id === deleteTarget.id) {
        closePreview();
      }

      setDeleteTarget(null);
      loadDocuments(search);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Admin</p>
        <h1 className="mt-2 text-3xl font-bold">Knowledge Base</h1>
        <p className="mt-2 text-slate-600">
          Upload, browse, search and manage the documents that power the AI assistant&apos;s
          knowledge base.
        </p>
      </div>

      <div className="mt-8">
        <KnowledgeStats stats={stats} averageProcessingTimeMs={averageProcessingTimeMs} />
      </div>

      <div className="mt-8">
        <KnowledgeUpload onUploaded={handleUploaded} />
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold">Documents</h2>
        <KnowledgeSearch value={search} onChange={setSearch} />
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4">
        <KnowledgeTable
          documents={documents}
          loading={loading}
          onPreview={handlePreview}
          onDeleteRequest={setDeleteTarget}
        />
      </div>

      <KnowledgeCard
        open={previewOpen}
        doc={previewDoc}
        loading={previewLoading}
        onClose={closePreview}
      />

      <KnowledgeDeleteDialog
        doc={deleteTarget}
        deleting={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}

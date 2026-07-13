"use client";

import { KnowledgeDocumentDetail } from "@/types/knowledge";

type Props = {
  open: boolean;
  doc: KnowledgeDocumentDetail | null;
  loading: boolean;
  onClose: () => void;
};

export default function KnowledgeCard({ open, doc, loading, onClose }: Props) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
              Document Preview
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {loading ? "Loading..." : doc?.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        {loading && (
          <div className="mt-6 text-center text-slate-500">Loading extracted text...</div>
        )}

        {!loading && doc && (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase text-slate-400">Type</dt>
                <dd className="mt-1 font-medium">{doc.document_type}</dd>
              </div>

              <div>
                <dt className="text-xs uppercase text-slate-400">Source</dt>
                <dd className="mt-1 font-medium">{doc.source_ref ?? "—"}</dd>
              </div>

              <div>
                <dt className="text-xs uppercase text-slate-400">Chunks</dt>
                <dd className="mt-1 font-medium">{doc.chunk_count}</dd>
              </div>

              <div>
                <dt className="text-xs uppercase text-slate-400">Uploaded</dt>
                <dd className="mt-1 font-medium">{new Date(doc.created_at).toLocaleString()}</dd>
              </div>
            </dl>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Extracted Text
              </p>
              <pre className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
                {doc.content}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

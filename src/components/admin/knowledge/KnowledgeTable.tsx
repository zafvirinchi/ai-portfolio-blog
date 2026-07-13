"use client";

import { KnowledgeDocument } from "@/types/knowledge";

type Props = {
  documents: KnowledgeDocument[];
  loading: boolean;
  onPreview: (doc: KnowledgeDocument) => void;
  onDeleteRequest: (doc: KnowledgeDocument) => void;
};

export default function KnowledgeTable({
  documents,
  loading,
  onPreview,
  onDeleteRequest,
}: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center text-slate-500 shadow-sm">
        Loading documents...
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center text-slate-500 shadow-sm">
        No knowledge documents found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3">Title</th>
            <th className="px-5 py-3">Type</th>
            <th className="px-5 py-3">Uploaded</th>
            <th className="px-5 py-3">Chunks</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>

        <tbody className="divide-y">
          {documents.map((doc) => (
            <tr key={doc.id} className="hover:bg-slate-50">
              <td className="px-5 py-4">
                <p className="font-semibold text-slate-900">{doc.title}</p>
                {doc.source_ref && (
                  <p className="mt-0.5 text-xs text-slate-500">{doc.source_ref}</p>
                )}
              </td>

              <td className="px-5 py-4">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  {doc.document_type}
                </span>
              </td>

              <td className="px-5 py-4 text-slate-600">
                {new Date(doc.created_at).toLocaleString()}
              </td>

              <td className="px-5 py-4 text-slate-600">{doc.chunk_count}</td>

              <td className="px-5 py-4">
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => onPreview(doc)}
                    className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50"
                  >
                    Preview
                  </button>

                  <button
                    onClick={() => onDeleteRequest(doc)}
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

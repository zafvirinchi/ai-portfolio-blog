"use client";

import { KnowledgeDocument } from "@/types/knowledge";

type Props = {
  doc: KnowledgeDocument | null;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function KnowledgeDeleteDialog({ doc, deleting, onConfirm, onCancel }: Props) {
  if (!doc) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">Delete document?</h2>

        <p className="mt-2 text-sm text-slate-600">
          This will permanently delete &quot;{doc.title}&quot; and all {doc.chunk_count}{" "}
          associated chunks from the knowledge base. This action cannot be undone.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { ChangeEvent, FormEvent, useState } from "react";

import { KnowledgeIngestResponse } from "@/types/knowledge";

const DOCUMENT_TYPES = [
  "upload",
  "profile",
  "resume",
  "project",
  "blog",
  "interview",
  "certifications",
];

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.txt,.md,.markdown";

type Props = {
  onUploaded: (result: KnowledgeIngestResponse) => void;
};

function uploadWithProgress(
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<KnowledgeIngestResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      let parsed: (KnowledgeIngestResponse & { error?: string }) | null = null;

      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Upload failed: invalid server response"));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && parsed) {
        resolve(parsed);
      } else {
        reject(new Error(parsed?.errors?.[0] || parsed?.error || "Upload failed"));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed: network error")));

    xhr.open("POST", "/api/admin/knowledge");
    xhr.send(formData);
  });
}

export default function KnowledgeUpload({ onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState("upload");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<KnowledgeIngestResponse | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setLastResult(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);
    setLastResult(null);

    const formData = new FormData();
    formData.append("file", file);
    if (title.trim()) formData.append("title", title.trim());
    formData.append("documentType", documentType);

    try {
      const result = await uploadWithProgress(formData, setProgress);

      setLastResult(result);
      onUploaded(result);
      setFile(null);
      setTitle("");
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">Upload Document</h2>
      <p className="mt-1 text-sm text-slate-500">Supported formats: PDF, DOCX, TXT, Markdown.</p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <input
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileChange}
          disabled={uploading}
          className="w-full rounded-xl border px-4 py-3 text-sm"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Title (optional, defaults to filename)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={uploading}
            className="w-full rounded-xl border px-4 py-3"
          />

          <select
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value)}
            disabled={uploading}
            className="w-full rounded-xl border px-4 py-3"
          >
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {uploading && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={uploading}
          className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {uploading ? `Uploading... ${progress}%` : "Upload & Process"}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {lastResult?.success && lastResult.document && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">
            &quot;{lastResult.document.title}&quot; processed successfully.
          </p>

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase text-green-700">Document Type</dt>
              <dd>{lastResult.document.document_type}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-green-700">Uploaded</dt>
              <dd>{new Date(lastResult.document.created_at).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-green-700">Chunks</dt>
              <dd>{lastResult.chunkCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-green-700">Embeddings</dt>
              <dd>{lastResult.embeddingCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-green-700">Processing Time</dt>
              <dd>{(lastResult.processingTimeMs / 1000).toFixed(2)}s</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

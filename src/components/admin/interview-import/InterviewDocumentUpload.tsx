"use client";

import { ChangeEvent, DragEvent, useState } from "react";

import type { DocumentQuestion, QualityReport, RemovedQuestion } from "@/lib/ai/interview-document";

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.txt";

export interface InterviewExtractApiResult {
  filename: string;
  questions: DocumentQuestion[];
  removed: RemovedQuestion[];
  quality: QualityReport;
}

type Props = {
  onExtracted: (result: InterviewExtractApiResult) => void;
};

function uploadWithProgress(file: File, onProgress: (percent: number) => void): Promise<InterviewExtractApiResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      let parsed: (InterviewExtractApiResult & { error?: string }) | null = null;

      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Extraction failed: invalid server response"));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && parsed) {
        resolve(parsed);
      } else {
        reject(new Error(parsed?.error || "Interview document extraction failed"));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed: network error")));

    xhr.open("POST", "/api/admin/interview/extract");
    xhr.send(formData);
  });
}

export default function InterviewDocumentUpload({ onExtracted }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  async function handleFile(file: File) {
    setFilename(file.name);
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const result = await uploadWithProgress(file, setProgress);
      onExtracted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Interview document extraction failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50"
        }`}
      >
        <input
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={handleInputChange}
          disabled={uploading}
        />

        <div className="rounded-full bg-blue-50 p-4 text-3xl">📋</div>

        <p className="mt-4 text-lg font-semibold text-slate-900">
          {uploading ? "Extracting interview questions..." : "Drag & drop an interview document here"}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          {uploading ? filename : "or click to browse — PDF, DOCX, or TXT"}
        </p>

        {uploading && (
          <div className="mt-6 w-full max-w-sm">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {progress < 100 ? `Uploading... ${progress}%` : "Parsing layout, detecting questions, generating missing answers..."}
            </p>
          </div>
        )}
      </label>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
    </div>
  );
}

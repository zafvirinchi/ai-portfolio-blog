"use client";

import { ChangeEvent, DragEvent, useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import type { JobParseResult } from "@/lib/ai/job/job-types";

/** Carries the parsed JSON error body through XMLHttpRequest's reject path (a plain Error loses everything but .message) so the caller can still distinguish an entitlement rejection from any other failure. */
class ApiError extends Error {
  constructor(
    message: string,
    public body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.txt,.md";

type Props = {
  onParsed: (result: JobParseResult) => void;
};

function uploadWithProgress(file: File, onProgress: (percent: number) => void): Promise<JobParseResult> {
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
      let parsed: (JobParseResult & { error?: string }) | null = null;

      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Parsing failed: invalid server response"));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && parsed) {
        resolve(parsed);
      } else {
        reject(new ApiError(parsed?.error || "Job description parsing failed", parsed));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed: network error")));

    xhr.open("POST", "/api/ai/job");
    xhr.send(formData);
  });
}

export default function JobUpload({ onParsed }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  async function handleFile(file: File) {
    setFilename(file.name);
    setError(null);
    setEntitlementError(null);
    setUploading(true);
    setProgress(0);

    try {
      const result = await uploadWithProgress(file, setProgress);
      onParsed(result);
    } catch (err) {
      const entitlement = err instanceof ApiError ? readEntitlementError(err.body, err.message) : null;
      if (entitlement) {
        setEntitlementError(entitlement);
      } else {
        setError(err instanceof Error ? err.message : "Job description parsing failed.");
      }
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

        <div className="rounded-full bg-blue-50 p-4 text-3xl">🧾</div>

        <p className="mt-4 text-lg font-semibold text-slate-900">
          {uploading ? "Analyzing the job description..." : "Drag & drop a job description here"}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          {uploading ? filename : "or click to browse — PDF, DOCX, TXT, or Markdown"}
        </p>

        {uploading && (
          <div className="mt-6 w-full max-w-sm">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {progress < 100 ? `Uploading... ${progress}%` : "Running AI analysis..."}
            </p>
          </div>
        )}
      </label>

      {entitlementError ? (
        <UpgradePrompt
          className="mt-4"
          featureLabel="Job Description Analyzer"
          code={entitlementError.code}
          featureId={entitlementError.featureId}
          message={entitlementError.message}
          limit={entitlementError.limit}
          used={entitlementError.used}
          period={entitlementError.period}
        />
      ) : (
        error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
    </div>
  );
}

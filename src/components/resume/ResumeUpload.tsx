"use client";

import { ChangeEvent, DragEvent, useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import type { ResumeAnalysisResult } from "@/lib/ai/resume/resume-types";

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.txt";

type Props = {
  onAnalyzed: (result: ResumeAnalysisResult) => void;
};

// Phase 23 Milestone 5 — genuine defect found and fixed: this route's
// ATS_CHECKS quota rejection (the app's primary entry point) was shown
// as a generic red string instead of UpgradePrompt, since a plain Error
// loses everything but .message across XMLHttpRequest's reject path.
// Carries the parsed JSON body through instead, matching the exact
// pattern already used by JobUpload.tsx/JobMatchUpload.tsx/JdUpload.tsx.
class ApiError extends Error {
  constructor(
    message: string,
    public body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function uploadWithProgress(
  file: File,
  onProgress: (percent: number) => void
): Promise<ResumeAnalysisResult> {
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
      let parsed: (ResumeAnalysisResult & { error?: string }) | null = null;

      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Analysis failed: invalid server response"));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && parsed) {
        resolve(parsed);
      } else {
        reject(new ApiError(parsed?.error || "Resume analysis failed", parsed));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed: network error")));

    xhr.open("POST", "/api/ai/resume");
    xhr.send(formData);
  });
}

export default function ResumeUpload({ onAnalyzed }: Props) {
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
      onAnalyzed(result);
    } catch (err) {
      const entitlement = err instanceof ApiError ? readEntitlementError(err.body, err.message) : null;
      if (entitlement) {
        setEntitlementError(entitlement);
      } else {
        setError(err instanceof Error ? err.message : "Resume analysis failed.");
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

        <div className="rounded-full bg-blue-50 p-4 text-3xl">📄</div>

        <p className="mt-4 text-lg font-semibold text-slate-900">
          {uploading ? "Analyzing your resume..." : "Drag & drop your resume here"}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          {uploading ? filename : "or click to browse — PDF, DOCX, or TXT"}
        </p>

        {uploading && (
          <div className="mt-6 w-full max-w-sm">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${progress}%` }}
              />
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
          featureLabel="Resume Analyzer"
          code={entitlementError.code}
          featureId={entitlementError.featureId}
          message={entitlementError.message}
          limit={entitlementError.limit}
          used={entitlementError.used}
          period={entitlementError.period}
        />
      ) : (
        error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )
      )}
    </div>
  );
}

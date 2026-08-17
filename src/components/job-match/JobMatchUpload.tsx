"use client";

import { ChangeEvent, DragEvent, useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import type { JobMatchResult } from "@/lib/ai/job-match/job-match-types";

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

const ACCEPTED_RESUME_EXTENSIONS = ".pdf,.docx,.txt";
const ACCEPTED_JD_EXTENSIONS = ".pdf,.docx,.txt,.md";

type Props = {
  onAnalyzed: (result: JobMatchResult) => void;
};

function submitWithProgress(
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<JobMatchResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      let parsed: (JobMatchResult & { error?: string }) | null = null;

      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Analysis failed: invalid server response"));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && parsed) {
        resolve(parsed);
      } else {
        reject(new ApiError(parsed?.error || "Job match analysis failed", parsed));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed: network error")));

    xhr.open("POST", "/api/ai/job-match");
    xhr.send(formData);
  });
}

function FilePicker({
  label,
  hint,
  accept,
  file,
  onChange,
}: {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    onChange(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
        isDragging
          ? "border-blue-500 bg-blue-50"
          : "border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50"
      }`}
    >
      <input type="file" accept={accept} className="hidden" onChange={handleInputChange} />

      <p className="text-sm font-semibold text-slate-900">{file ? file.name : label}</p>
      <p className="mt-1 text-xs text-slate-500">{file ? "Click to change" : hint}</p>
    </label>
  );
}

export default function JobMatchUpload({ onAnalyzed }: Props) {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jdMode, setJdMode] = useState<"paste" | "upload">("paste");
  const [jdText, setJdText] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);

  const canSubmit = resumeFile !== null && (jdMode === "paste" ? jdText.trim().length > 0 : jdFile !== null);

  async function handleSubmit() {
    if (!resumeFile || !canSubmit) return;

    setError(null);
    setEntitlementError(null);
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("resume", resumeFile);

    if (jdMode === "paste") {
      formData.append("jdText", jdText.trim());
    } else if (jdFile) {
      formData.append("jdFile", jdFile);
    }

    try {
      const result = await submitWithProgress(formData, setProgress);
      onAnalyzed(result);
    } catch (err) {
      const entitlement = err instanceof ApiError ? readEntitlementError(err.body, err.message) : null;
      if (entitlement) {
        setEntitlementError(entitlement);
      } else {
        setError(err instanceof Error ? err.message : "Job match analysis failed.");
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">1. Your resume</p>
        <FilePicker
          label="Drag & drop your resume here"
          hint="or click to browse — PDF, DOCX, or TXT"
          accept={ACCEPTED_RESUME_EXTENSIONS}
          file={resumeFile}
          onChange={setResumeFile}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">2. Job description</p>

          <div className="flex rounded-lg border border-slate-300 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setJdMode("paste")}
              className={`rounded-md px-3 py-1.5 ${jdMode === "paste" ? "bg-blue-600 text-white" : "text-slate-600"}`}
            >
              Paste text
            </button>
            <button
              type="button"
              onClick={() => setJdMode("upload")}
              className={`rounded-md px-3 py-1.5 ${jdMode === "upload" ? "bg-blue-600 text-white" : "text-slate-600"}`}
            >
              Upload file
            </button>
          </div>
        </div>

        {jdMode === "paste" ? (
          <textarea
            value={jdText}
            onChange={(event) => setJdText(event.target.value)}
            rows={10}
            placeholder="Paste the full job description here..."
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
          />
        ) : (
          <FilePicker
            label="Drag & drop the job description here"
            hint="or click to browse — PDF, DOCX, TXT, or MD"
            accept={ACCEPTED_JD_EXTENSIONS}
            file={jdFile}
            onChange={setJdFile}
          />
        )}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || uploading}
        className="w-full rounded-xl bg-blue-600 px-6 py-3.5 text-center font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {uploading ? "Analyzing..." : "Analyze Match"}
      </button>

      {uploading && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-center text-xs font-medium text-slate-500">
            {progress < 100 ? `Uploading... ${progress}%` : "Running AI analysis..."}
          </p>
        </div>
      )}

      {entitlementError ? (
        <UpgradePrompt
          featureLabel="Job Match"
          code={entitlementError.code}
          featureId={entitlementError.featureId}
          message={entitlementError.message}
          limit={entitlementError.limit}
          used={entitlementError.used}
          period={entitlementError.period}
        />
      ) : (
        error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
    </div>
  );
}

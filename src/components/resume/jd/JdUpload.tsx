"use client";

import { ChangeEvent, DragEvent, useState } from "react";

import type { JdMatchApiResult } from "./types";

const ACCEPTED_JD_EXTENSIONS = ".pdf,.docx,.txt,.md";

type Props = {
  resumeId: string;
  onAnalyzed: (result: JdMatchApiResult) => void;
};

function submitWithProgress(formData: FormData, onProgress: (percent: number) => void): Promise<JdMatchApiResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      let parsed: (JdMatchApiResult & { error?: string }) | null = null;

      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Analysis failed: invalid server response"));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && parsed) {
        resolve(parsed);
      } else {
        reject(new Error(parsed?.error || "Job description analysis failed"));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed: network error")));

    xhr.open("POST", "/api/ai/resume/jd-match");
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

export default function JdUpload({ resumeId, onAnalyzed }: Props) {
  const [jdMode, setJdMode] = useState<"paste" | "upload">("paste");
  const [jdText, setJdText] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = jdMode === "paste" ? jdText.trim().length > 0 : jdFile !== null;

  async function handleSubmit() {
    if (!canSubmit) return;

    setError(null);
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("resumeId", resumeId);

    if (jdMode === "paste") {
      formData.append("jdText", jdText.trim());
    } else if (jdFile) {
      formData.append("jdFile", jdFile);
    }

    try {
      const result = await submitWithProgress(formData, setProgress);
      onAnalyzed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Job description analysis failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">Paste or upload the job description</p>

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
          rows={8}
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

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || uploading}
        className="mt-4 w-full rounded-xl bg-blue-600 px-6 py-3.5 text-center font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {uploading ? "Analyzing match..." : "Analyze Match"}
      </button>

      {uploading && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-center text-xs font-medium text-slate-500">
            {progress < 100 ? `Uploading... ${progress}%` : "Running AI match analysis..."}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}
    </div>
  );
}

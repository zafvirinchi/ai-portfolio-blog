"use client";

import { useState } from "react";

import InterviewImportUpload, {
  InterviewImportApiResult,
} from "@/components/admin/interview-import/InterviewImportUpload";
import InterviewImportSummary from "@/components/admin/interview-import/InterviewImportSummary";

export default function AdminInterviewImportPage() {
  const [result, setResult] = useState<InterviewImportApiResult | null>(null);

  return (
    <section>
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Admin</p>
        <h1 className="mt-2 text-3xl font-bold">Interview Import</h1>
        <p className="mt-2 text-slate-600">
          Upload an interview document (PDF, DOCX, or TXT) to automatically extract questions, generate
          missing answers, and import everything into the Interview Categories, Topics, and Questions tables
          — no manual entry required.
        </p>
      </div>

      <div className="mt-8 space-y-8">
        <div className="mx-auto max-w-2xl">
          <InterviewImportUpload onImported={setResult} />
        </div>

        {result && (
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Import complete — view results below.</p>
            <button
              onClick={() => setResult(null)}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Import another document
            </button>
          </div>
        )}

        {result && <InterviewImportSummary result={result} />}
      </div>
    </section>
  );
}

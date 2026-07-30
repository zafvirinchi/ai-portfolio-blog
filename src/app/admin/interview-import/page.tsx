"use client";

import { useState } from "react";

import InterviewDocumentUpload, {
  InterviewExtractApiResult,
} from "@/components/admin/interview-import/InterviewDocumentUpload";
import InterviewReviewPanel from "@/components/admin/interview-import/InterviewReviewPanel";

export default function AdminInterviewImportPage() {
  const [extracted, setExtracted] = useState<InterviewExtractApiResult | null>(null);

  return (
    <section>
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">Admin</p>
        <h1 className="mt-2 text-3xl font-bold">Interview Import Review</h1>
        <p className="mt-2 text-slate-600">
          Upload an interview document (PDF, DOCX, or TXT) to extract questions and answers, review and edit
          everything below, then import only what you approve into the Interview Categories, Topics, and
          Questions tables. Answers already present in the document are preserved exactly as written; AI only
          fills in what&apos;s genuinely missing.
        </p>
      </div>

      <div className="mt-8 space-y-8">
        {!extracted && (
          <div className="mx-auto max-w-2xl">
            <InterviewDocumentUpload onExtracted={setExtracted} />
          </div>
        )}

        {extracted && <InterviewReviewPanel result={extracted} onDone={() => setExtracted(null)} />}
      </div>
    </section>
  );
}

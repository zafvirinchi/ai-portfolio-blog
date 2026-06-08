"use client";

import { FormEvent, useState } from "react";

export default function RagDocumentForm() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const form = event.currentTarget;
        setLoading(true);

        const formData = new FormData(form);

    const payload = {
      title: String(formData.get("title") || "").trim(),
      document_type: String(formData.get("document_type") || "").trim(),
      source_ref: String(formData.get("source_ref") || "").trim() || null,
      content: String(formData.get("content") || "").trim(),
    };

    const response = await fetch("/api/admin/rag-documents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setLoading(false);

    if (!response.ok) {
      alert(result.error || "Failed to save RAG document");
      return;
    }

    alert("RAG document saved and processed successfully");
    form.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border bg-white p-6">
      <input
        name="title"
        required
        placeholder="Document title"
        className="w-full rounded-xl border px-4 py-3"
      />

      <select
        name="document_type"
        required
        className="w-full rounded-xl border px-4 py-3"
      >
        <option value="">Select document type</option>
        <option value="profile">Profile</option>
        <option value="resume">Resume</option>
        <option value="project">Project</option>
        <option value="blog">Blog</option>
        <option value="interview">Interview Q&A</option>
        <option value="birthday">Birthday Surprise</option>
      </select>

      <input
        name="source_ref"
        placeholder="Optional source reference"
        className="w-full rounded-xl border px-4 py-3"
      />

      <textarea
        name="content"
        required
        rows={14}
        placeholder="Paste your RAG document content here..."
        className="w-full rounded-xl border px-4 py-3"
      />

      <button
        disabled={loading}
        className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Processing..." : "Save & Process Document"}
      </button>
    </form>
  );
}
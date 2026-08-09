"use client";

import { useState } from "react";

import type { LinkedinMessage } from "@/lib/ai/cover-letter/cover-schema";

type Props = {
  messages: LinkedinMessage[] | null;
  onGenerate: () => Promise<void>;
};

export default function CoverLetterLinkedinPanel({ messages, onGenerate }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      await onGenerate();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Generating..." : messages ? "Regenerate LinkedIn Messages" : "Generate LinkedIn Messages"}
        </button>
      </div>

      {messages && messages.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {messages.map((message) => (
            <div key={message.type} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">{message.type}</p>
              <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{message.message}</p>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(message.message)}
                className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          No LinkedIn messages generated yet.
        </div>
      )}
    </div>
  );
}

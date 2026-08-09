"use client";

import { useState } from "react";

import { EMAIL_AUDIENCES } from "@/lib/ai/cover-letter/cover-schema";
import type { EmailAudience, EmailVariant } from "@/lib/ai/cover-letter/cover-schema";

type Props = {
  emails: Partial<Record<EmailAudience, EmailVariant>>;
  onGenerate: (audience: EmailAudience) => Promise<void>;
};

export default function CoverLetterEmailPanel({ emails, onGenerate }: Props) {
  const [loadingAudience, setLoadingAudience] = useState<EmailAudience | null>(null);

  async function handleGenerate(audience: EmailAudience) {
    setLoadingAudience(audience);
    try {
      await onGenerate(audience);
    } finally {
      setLoadingAudience(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {EMAIL_AUDIENCES.map((audience) => (
          <button
            key={audience}
            type="button"
            onClick={() => handleGenerate(audience)}
            disabled={loadingAudience === audience}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingAudience === audience ? "Generating..." : `Generate ${audience} Email`}
          </button>
        ))}
      </div>

      {EMAIL_AUDIENCES.map((audience) => {
        const email = emails[audience];
        if (!email) return null;

        return (
          <div key={audience} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">{audience} Email</p>
            <p className="mb-2 text-sm font-semibold text-slate-800">Subject: {email.subject}</p>
            <p className="whitespace-pre-line text-sm leading-7 text-slate-700">{email.body}</p>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)}
              className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Copy
            </button>
          </div>
        );
      })}

      {Object.keys(emails).length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          No application emails generated yet.
        </div>
      )}
    </div>
  );
}

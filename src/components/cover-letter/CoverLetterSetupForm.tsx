"use client";

import { useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import { COVER_LETTER_LENGTHS, COVER_LETTER_STYLES } from "@/lib/ai/cover-letter/cover-schema";
import type { CoverLetterLength, CoverLetterStyle } from "@/lib/ai/cover-letter/cover-schema";
import type { CoverLetterRecord } from "@/lib/ai/cover-letter/cover-types";

type Props = {
  jdMatchId: string;
  loading: boolean;
  error: string | null;
  onGenerated: (record: CoverLetterRecord) => void;
};

export default function CoverLetterSetupForm({ jdMatchId, loading, error, onGenerated }: Props) {
  const [companyName, setCompanyName] = useState("");
  const [hiringManager, setHiringManager] = useState("");
  const [role, setRole] = useState("");
  const [style, setStyle] = useState<CoverLetterStyle>("Professional");
  const [length, setLength] = useState<CoverLetterLength>("Standard");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);

  async function handleGenerate() {
    setSubmitting(true);
    setLocalError(null);
    setEntitlementError(null);

    try {
      const response = await fetch("/api/ai/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jdMatchId,
          companyName: companyName.trim() || undefined,
          hiringManager: hiringManager.trim() || undefined,
          role: role.trim() || undefined,
          style,
          length,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Failed to generate cover letter");
        if (entitlement) {
          setEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Failed to generate cover letter");
      }

      onGenerated(data);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to generate cover letter.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Company name</label>
          <input
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Defaults from the job description"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Role</label>
          <input
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="Defaults from the job description"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500">Hiring manager (optional)</label>
        <input
          value={hiringManager}
          onChange={(event) => setHiringManager(event.target.value)}
          placeholder="Leave blank for a general greeting"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Style</p>
        <div className="flex flex-wrap gap-2">
          {COVER_LETTER_STYLES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStyle(option)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                style === option ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Length</p>
        <div className="flex gap-2">
          {COVER_LETTER_LENGTHS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setLength(option)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                length === option ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={submitting || loading}
        className="w-full rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "Generating..." : "Generate Cover Letter"}
      </button>

      {entitlementError && (
        <UpgradePrompt
          featureLabel="Cover Letter Generator"
          code={entitlementError.code}
          featureId={entitlementError.featureId}
          message={entitlementError.message}
          limit={entitlementError.limit}
          used={entitlementError.used}
          period={entitlementError.period}
          onRetry={handleGenerate}
        />
      )}

      {(localError || error) && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {localError || error}
        </div>
      )}
    </div>
  );
}

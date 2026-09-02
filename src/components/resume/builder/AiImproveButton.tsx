"use client";

import { useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";

// Phase 25 Milestone 1 — generic "Improve with AI" affordance for a
// single textarea field (Summary/Experience/Projects/Achievements).
// Calls the new stateless /ai-improve route, shows Original vs
// Suggested, and only ever calls onAccept() on an explicit click —
// nothing is ever auto-applied, and Accept just hands the chosen text
// to the caller's existing onCommit/onUpdate, which persists it
// through the SAME entry-update route every other field edit already
// uses. Reject simply discards the panel; the field is untouched.

type ImproveSection = "summary" | "experience" | "achievements" | "projects";

interface RewriteVariant {
  version: string;
  text: string;
  explanation: { whyBetter: string };
}

export default function AiImproveButton({
  versionId,
  section,
  originalText,
  onAccept,
}: {
  versionId: string;
  section: ImproveSection;
  originalText: string;
  onAccept: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);
  const [suggestions, setSuggestions] = useState<RewriteVariant[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  async function handleImprove() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setEntitlementError(null);
    setSuggestions(null);

    try {
      const response = await fetch(`/api/ai/resume/versions/${versionId}/ai-improve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, itemText: originalText, style: "Professional" }),
      });
      const data = await response.json();
      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Could not generate a suggestion.");
        if (entitlement) {
          setEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Could not generate a suggestion.");
      }
      setSuggestions(data.suggestions ?? []);
      setSelectedIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a suggestion.");
    } finally {
      setLoading(false);
    }
  }

  function accept() {
    const chosen = suggestions?.[selectedIndex];
    if (!chosen) return;
    onAccept(chosen.text);
    setOpen(false);
    setSuggestions(null);
  }

  function reject() {
    setOpen(false);
    setSuggestions(null);
    setError(null);
    setEntitlementError(null);
  }

  if (!originalText.trim()) return null;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={handleImprove}
        disabled={loading}
        className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 disabled:opacity-50"
      >
        {loading ? "Improving..." : "✨ Improve with AI"}
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-purple-200 bg-purple-50/60 p-3" role="region" aria-label="AI improvement suggestion">
          {loading && <p className="text-xs text-slate-500">Generating a suggestion...</p>}

          {entitlementError ? (
            <UpgradePrompt
              featureLabel="AI Resume Improvement"
              code={entitlementError.code}
              featureId={entitlementError.featureId}
              message={entitlementError.message}
              limit={entitlementError.limit}
              used={entitlementError.used}
              period={entitlementError.period}
              onRetry={handleImprove}
            />
          ) : (
            error && <p className="text-xs text-red-600">{error}</p>
          )}

          {suggestions && suggestions.length > 0 && (
            <div>
              {suggestions.length > 1 && (
                <div className="mb-2 flex gap-1" role="group" aria-label="Choose a suggestion version">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.version}
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      aria-pressed={selectedIndex === index}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selectedIndex === index ? "bg-purple-600 text-white" : "bg-white text-purple-600"}`}
                    >
                      Version {suggestion.version}
                    </button>
                  ))}
                </div>
              )}

              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Original</p>
              <p className="text-xs text-slate-600">{originalText}</p>

              <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-purple-600">Suggested</p>
              <p className="text-xs text-slate-800">{suggestions[selectedIndex].text}</p>

              {suggestions[selectedIndex].explanation.whyBetter && (
                <p className="mt-1 text-[11px] italic text-slate-500">{suggestions[selectedIndex].explanation.whyBetter}</p>
              )}

              <div className="mt-2 flex gap-2">
                <button type="button" onClick={accept} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700">
                  Accept
                </button>
                <button type="button" onClick={reject} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

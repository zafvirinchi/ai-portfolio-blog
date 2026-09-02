"use client";

import { useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";

// Phase 25 Milestone 1 — the Skills-section counterpart to
// AiImproveButton. The Skills generator (generateSkillsRewrite)
// re-categorizes the candidate's REAL skills across the whole resume
// rather than rewriting one passed-in string, so its suggestion shape
// (category groups) and accept action (replace this one entry's
// category+skills) differ enough from the single-text flow to warrant
// its own small component rather than overloading AiImproveButton.
interface SkillCategorySuggestion {
  category: string;
  skills: string[];
}

export default function AiImproveSkillsButton({
  versionId,
  onAccept,
}: {
  versionId: string;
  onAccept: (category: string, skills: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);
  const [categories, setCategories] = useState<SkillCategorySuggestion[] | null>(null);

  async function handleImprove() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setEntitlementError(null);
    setCategories(null);

    try {
      const response = await fetch(`/api/ai/resume/versions/${versionId}/ai-improve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "skills" }),
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
      setCategories(data.suggestion?.categories ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a suggestion.");
    } finally {
      setLoading(false);
    }
  }

  function reject() {
    setOpen(false);
    setCategories(null);
    setError(null);
    setEntitlementError(null);
  }

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
        <div className="mt-2 rounded-xl border border-purple-200 bg-purple-50/60 p-3" role="region" aria-label="AI skills suggestion">
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

          {categories && categories.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600">Suggested categories</p>
              {categories.map((group) => (
                <div key={group.category} className="rounded-lg border border-purple-100 bg-white p-2">
                  <p className="text-xs font-semibold text-slate-800">{group.category}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{group.skills.join(", ")}</p>
                  <button
                    type="button"
                    onClick={() => {
                      onAccept(group.category, group.skills);
                      setOpen(false);
                      setCategories(null);
                    }}
                    className="mt-1.5 rounded-lg bg-purple-600 px-3 py-1 text-xs font-semibold text-white hover:bg-purple-700"
                  >
                    Use this list
                  </button>
                </div>
              ))}
              <button type="button" onClick={reject} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                Reject
              </button>
            </div>
          )}

          {categories && categories.length === 0 && !loading && <p className="text-xs text-slate-500">No suggestion available.</p>}
        </div>
      )}
    </div>
  );
}

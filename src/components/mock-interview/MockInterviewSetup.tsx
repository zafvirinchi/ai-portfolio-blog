"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import UpgradePrompt from "@/components/billing/platform/UpgradePrompt";
import { EntitlementErrorInfo, readEntitlementError } from "@/lib/billing/entitlement-client-error";
import { INTERVIEW_TYPES, SESSION_MODES } from "@/lib/ai/mock-interview/session-schema";
import type { InterviewType, SessionMode } from "@/lib/ai/mock-interview/session-schema";
import type { SessionTurnResult } from "@/lib/ai/mock-interview/session-service";

type Props = {
  resumeId: string;
  jdMatchId: string;
  prepId?: string;
  hasSession: boolean;
  onStarted: (result: SessionTurnResult) => void;
};

function isInterviewType(value: string | null): value is InterviewType {
  return value !== null && (INTERVIEW_TYPES as readonly string[]).includes(value);
}

export default function MockInterviewSetup({ resumeId, jdMatchId, prepId, hasSession, onStarted }: Props) {
  // Phase 17 Milestone 5 — the Debrief's "Practice weak category" CTA
  // links back here with ?interviewType=<type> as a starting-form
  // preselection only; it never bypasses this form or the question-
  // selection cascade itself. Falls back to "Mixed" for any missing or
  // invalid value, exactly as before this milestone.
  const preselectedType = useSearchParams().get("interviewType");
  const [interviewType, setInterviewType] = useState<InterviewType>(isInterviewType(preselectedType) ? preselectedType : "Mixed");
  const [mode, setMode] = useState<SessionMode>("practice");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entitlementError, setEntitlementError] = useState<EntitlementErrorInfo | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    setEntitlementError(null);

    try {
      const response = await fetch("/api/ai/mock-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, jdMatchId, prepId, interviewType, mode }),
      });

      const data = await response.json();

      if (!response.ok) {
        const entitlement = readEntitlementError(data, "Failed to start mock interview");
        if (entitlement) {
          setEntitlementError(entitlement);
          return;
        }
        throw new Error(data.error || "Failed to start mock interview");
      }

      onStarted(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start mock interview.");
    } finally {
      setLoading(false);
    }
  }

  if (hasSession) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
        A mock interview is already in progress — head to the Interview tab. Use its Restart control there to configure a new run.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Interview type</p>
        <div className="flex flex-wrap gap-2">
          {INTERVIEW_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setInterviewType(type)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                interviewType === type ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Mode</p>
        <div className="flex gap-2">
          {SESSION_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition ${
                mode === m ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {mode === "practice" ? "Hints are available while you answer." : "No hints — behaves like a real interview."}
        </p>
      </div>

      <button
        onClick={handleStart}
        disabled={loading}
        className="w-full rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Starting..." : "Start Mock Interview"}
      </button>

      {entitlementError ? (
        <UpgradePrompt
          featureLabel="Mock Interview"
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

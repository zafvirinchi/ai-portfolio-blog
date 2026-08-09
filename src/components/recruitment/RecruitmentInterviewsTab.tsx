"use client";

import { useCallback, useEffect, useState } from "react";

import { INTERVIEW_STATUSES, INTERVIEW_TYPES } from "@/lib/ai/recruitment/pipeline-schema";
import type { InterviewSchedule, PipelineCandidate } from "@/lib/ai/recruitment/pipeline-types";
import type { CandidateSummary } from "@/lib/ai/recruiter/candidate-types";

type EnrichedPipelineCandidate = PipelineCandidate & { candidate: CandidateSummary | null };

type Props = {
  jobId: string | null;
};

export default function RecruitmentInterviewsTab({ jobId }: Props) {
  const [entries, setEntries] = useState<EnrichedPipelineCandidate[]>([]);
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [pipelineCandidateId, setPipelineCandidateId] = useState("");
  const [type, setType] = useState<string>(INTERVIEW_TYPES[0]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, { rating: string; notes: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;

    const [pipelineResponse, interviewsResponse] = await Promise.all([
      fetch(`/api/ai/recruitment/jobs/${jobId}/pipeline`),
      fetch(`/api/ai/recruitment/interviews?jobId=${jobId}`),
    ]);
    setEntries(await pipelineResponse.json());
    setInterviews(await interviewsResponse.json());
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSchedule() {
    if (!pipelineCandidateId || !scheduledAt) return;
    setBusy("schedule");
    setError(null);

    try {
      const response = await fetch("/api/ai/recruitment/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineCandidateId, type, scheduledAt, interviewer: interviewer.trim() || null }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scheduling failed");

      setScheduledAt("");
      setInterviewer("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scheduling failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateKit(interviewId: string) {
    setBusy(interviewId);
    try {
      await fetch(`/api/ai/recruitment/interviews/${interviewId}/generate-kit`, { method: "POST" });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function handleStatus(interviewId: string, status: string) {
    await fetch(`/api/ai/recruitment/interviews/${interviewId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function handleFeedback(interviewId: string) {
    const draft = feedbackDrafts[interviewId];
    if (!draft?.notes?.trim()) return;

    setBusy(`feedback-${interviewId}`);
    try {
      await fetch(`/api/ai/recruitment/interviews/${interviewId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: Number(draft.rating) || 3, notes: draft.notes.trim() }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function handleSummarize(interviewId: string) {
    setBusy(`summarize-${interviewId}`);
    try {
      await fetch(`/api/ai/recruitment/interviews/${interviewId}/feedback/summarize`, { method: "POST" });
      load();
    } finally {
      setBusy(null);
    }
  }

  if (!jobId) {
    return <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Select a job in the Jobs tab first.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Schedule Interview</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <select value={pipelineCandidateId} onChange={(e) => setPipelineCandidateId(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select a candidate...</option>
            {entries.map((entry) => (
              <option key={entry.pipelineCandidateId} value={entry.pipelineCandidateId}>
                {entry.candidate?.name ?? "Unknown"}
              </option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            {INTERVIEW_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={interviewer} onChange={(e) => setInterviewer(e.target.value)} placeholder="Interviewer" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button
          onClick={handleSchedule}
          disabled={busy === "schedule" || !pipelineCandidateId || !scheduledAt}
          className="mt-3 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy === "schedule" ? "Scheduling..." : "Schedule Interview"}
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      {interviews.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No interviews scheduled yet.</p>
      ) : (
        <div className="space-y-3">
          {interviews.map((interview) => {
            const candidateName = entries.find((entry) => entry.pipelineCandidateId === interview.pipelineCandidateId)?.candidate?.name ?? "Unknown";
            const draft = feedbackDrafts[interview.interviewId] ?? { rating: "3", notes: "" };

            return (
              <div key={interview.interviewId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">
                    {interview.type} — {candidateName}
                  </p>
                  <select value={interview.status} onChange={(e) => handleStatus(interview.interviewId, e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                    {INTERVIEW_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-500">
                  {interview.scheduledAt} · {interview.interviewer ?? "interviewer TBD"}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleGenerateKit(interview.interviewId)}
                    disabled={busy === interview.interviewId}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busy === interview.interviewId ? "Generating..." : "Generate Interview Kit"}
                  </button>
                </div>

                {interview.checklist && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <h5 className="mb-1 text-xs font-bold uppercase text-slate-500">Checklist</h5>
                      <ul className="list-disc pl-4 text-xs text-slate-600">
                        {interview.checklist.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h5 className="mb-1 text-xs font-bold uppercase text-slate-500">Questions</h5>
                      <ul className="list-disc pl-4 text-xs text-slate-600">
                        {interview.questions?.map((q, index) => (
                          <li key={index}>
                            [{q.difficulty}] {q.question}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h5 className="mb-1 text-xs font-bold uppercase text-slate-500">Evaluation Form</h5>
                      <ul className="list-disc pl-4 text-xs text-slate-600">
                        {interview.evaluationForm?.map((c, index) => (
                          <li key={index}>
                            {c.criterion} ({c.weight}%)
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="mt-3 border-t border-slate-100 pt-3">
                  <h5 className="mb-2 text-xs font-bold uppercase text-slate-500">Feedback</h5>
                  {interview.feedback ? (
                    <div className="text-sm text-slate-700">
                      <p>
                        Rating: {interview.feedback.rating}/5 — {interview.feedback.notes}
                      </p>
                      {interview.feedback.summary ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Summary: {interview.feedback.summary} ({interview.feedback.recommendation})
                        </p>
                      ) : (
                        <button
                          onClick={() => handleSummarize(interview.interviewId)}
                          disabled={busy === `summarize-${interview.interviewId}`}
                          className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Generate Feedback Summary
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={draft.rating}
                        onChange={(e) => setFeedbackDrafts((prev) => ({ ...prev, [interview.interviewId]: { ...draft, rating: e.target.value } }))}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}/5
                          </option>
                        ))}
                      </select>
                      <input
                        value={draft.notes}
                        onChange={(e) => setFeedbackDrafts((prev) => ({ ...prev, [interview.interviewId]: { ...draft, notes: e.target.value } }))}
                        placeholder="Interview notes..."
                        className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={() => handleFeedback(interview.interviewId)}
                        disabled={busy === `feedback-${interview.interviewId}`}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Save Feedback
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

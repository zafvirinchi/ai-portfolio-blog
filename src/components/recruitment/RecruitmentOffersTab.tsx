"use client";

import { useCallback, useEffect, useState } from "react";

import { OFFER_STATUSES } from "@/lib/ai/recruitment/pipeline-schema";
import type { InterviewSchedule, Offer, PipelineCandidate } from "@/lib/ai/recruitment/pipeline-types";
import type { CandidateSummary } from "@/lib/ai/recruiter/candidate-types";

type EnrichedPipelineCandidate = PipelineCandidate & { candidate: CandidateSummary | null };

type Props = {
  jobId: string | null;
};

const EMAIL_TYPES = [
  { value: "invitation", label: "Interview Invitation", needsInterview: true },
  { value: "reminder", label: "Interview Reminder", needsInterview: true },
  { value: "offer", label: "Offer Letter", needsOffer: true },
  { value: "rejection", label: "Rejection" },
  { value: "follow-up", label: "Follow-up" },
] as const;

export default function RecruitmentOffersTab({ jobId }: Props) {
  const [entries, setEntries] = useState<EnrichedPipelineCandidate[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);
  const [pipelineCandidateId, setPipelineCandidateId] = useState("");
  const [salary, setSalary] = useState("");
  const [startDate, setStartDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [emailType, setEmailType] = useState<(typeof EMAIL_TYPES)[number]["value"]>("invitation");
  const [emailPipelineCandidateId, setEmailPipelineCandidateId] = useState("");
  const [emailInterviewId, setEmailInterviewId] = useState("");
  const [emailOfferId, setEmailOfferId] = useState("");
  const [emailResult, setEmailResult] = useState<{ subject: string; body: string } | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;

    const [pipelineResponse, offersResponse, interviewsResponse] = await Promise.all([
      fetch(`/api/ai/recruitment/jobs/${jobId}/pipeline`),
      fetch(`/api/ai/recruitment/offers?jobId=${jobId}`),
      fetch(`/api/ai/recruitment/interviews?jobId=${jobId}`),
    ]);
    setEntries(await pipelineResponse.json());
    setOffers(await offersResponse.json());
    setInterviews(await interviewsResponse.json());
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateOffer() {
    if (!pipelineCandidateId) return;
    setBusy("create");

    try {
      await fetch("/api/ai/recruitment/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineCandidateId, salary: salary.trim() || null, startDate: startDate.trim() || null, expiryDate: expiryDate.trim() || null }),
      });
      setSalary("");
      setStartDate("");
      setExpiryDate("");
      load();
    } finally {
      setBusy(null);
    }
  }

  async function handleStatus(offerId: string, status: string) {
    await fetch(`/api/ai/recruitment/offers/${offerId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function handleGenerateEmail() {
    if (!emailPipelineCandidateId) return;
    setBusy("email");
    setEmailError(null);
    setEmailResult(null);

    try {
      const body: Record<string, string> = { pipelineCandidateId: emailPipelineCandidateId };
      if (emailType === "invitation" || emailType === "reminder") body.interviewId = emailInterviewId;
      if (emailType === "offer") body.offerId = emailOfferId;

      const response = await fetch(`/api/ai/recruitment/emails/${emailType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Email generation failed");

      setEmailResult(data);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Email generation failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!jobId) {
    return <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Select a job in the Jobs tab first.</p>;
  }

  const selectedEmailType = EMAIL_TYPES.find((item) => item.value === emailType)!;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Create Offer</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <select value={pipelineCandidateId} onChange={(e) => setPipelineCandidateId(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select a candidate...</option>
            {entries.map((entry) => (
              <option key={entry.pipelineCandidateId} value={entry.pipelineCandidateId}>
                {entry.candidate?.name ?? "Unknown"}
              </option>
            ))}
          </select>
          <input value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="Salary" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Start date" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} placeholder="Offer expiry date" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button
          onClick={handleCreateOffer}
          disabled={busy === "create" || !pipelineCandidateId}
          className="mt-3 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Create Offer
        </button>
      </div>

      {offers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No offers created yet.</p>
      ) : (
        <div className="space-y-2">
          {offers.map((offer) => {
            const candidateName = entries.find((entry) => entry.pipelineCandidateId === offer.pipelineCandidateId)?.candidate?.name ?? "Unknown";
            return (
              <div key={offer.offerId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <p className="font-semibold text-slate-800">{candidateName}</p>
                  <p className="text-xs text-slate-500">
                    {offer.salary ?? "salary TBD"} · Start: {offer.startDate ?? "TBD"} · Expires: {offer.expiryDate ?? "TBD"}
                  </p>
                </div>
                <select value={offer.status} onChange={(e) => handleStatus(offer.offerId, e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                  {OFFER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Generate Candidate Email</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <select value={emailType} onChange={(e) => setEmailType(e.target.value as typeof emailType)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            {EMAIL_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={emailPipelineCandidateId} onChange={(e) => setEmailPipelineCandidateId(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select a candidate...</option>
            {entries.map((entry) => (
              <option key={entry.pipelineCandidateId} value={entry.pipelineCandidateId}>
                {entry.candidate?.name ?? "Unknown"}
              </option>
            ))}
          </select>
          {"needsInterview" in selectedEmailType && selectedEmailType.needsInterview && (
            <select value={emailInterviewId} onChange={(e) => setEmailInterviewId(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select an interview...</option>
              {interviews.map((interview) => (
                <option key={interview.interviewId} value={interview.interviewId}>
                  {interview.type} — {interview.scheduledAt}
                </option>
              ))}
            </select>
          )}
          {"needsOffer" in selectedEmailType && selectedEmailType.needsOffer && (
            <select value={emailOfferId} onChange={(e) => setEmailOfferId(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select an offer...</option>
              {offers.map((offer) => (
                <option key={offer.offerId} value={offer.offerId}>
                  {offer.salary ?? offer.offerId}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={handleGenerateEmail}
          disabled={busy === "email" || !emailPipelineCandidateId}
          className="mt-3 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy === "email" ? "Generating..." : "Generate Email"}
        </button>

        {emailError && <p className="mt-2 text-sm text-red-700">{emailError}</p>}

        {emailResult && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Subject: {emailResult.subject}</p>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{emailResult.body}</p>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

import { CANDIDATE_STAGES, CandidateStage } from "@/lib/ai/recruitment/pipeline-schema";
import type { PipelineCandidate } from "@/lib/ai/recruitment/pipeline-types";
import type { CandidateSummary } from "@/lib/ai/recruiter/candidate-types";

type EnrichedPipelineCandidate = PipelineCandidate & { candidate: CandidateSummary | null };

type Props = {
  jobId: string | null;
};

export default function RecruitmentPipelineTab({ jobId }: Props) {
  const [entries, setEntries] = useState<EnrichedPipelineCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);

    try {
      const response = await fetch(`/api/ai/recruitment/jobs/${jobId}/pipeline`);
      const data = await response.json();
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDrop(stage: CandidateStage, candidateId: string) {
    if (!jobId) return;

    await fetch(`/api/ai/recruitment/jobs/${jobId}/pipeline/${candidateId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });

    setDraggingId(null);
    load();
  }

  if (!jobId) {
    return <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Select a job in the Jobs tab first.</p>;
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading pipeline...</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3" style={{ minWidth: `${CANDIDATE_STAGES.length * 220}px` }}>
        {CANDIDATE_STAGES.map((stage) => {
          const columnEntries = entries.filter((entry) => entry.stage === stage);

          return (
            <div
              key={stage}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const candidateId = event.dataTransfer.getData("text/plain");
                if (candidateId) handleDrop(stage, candidateId);
              }}
              className="w-52 flex-shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-3"
            >
              <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">
                {stage} <span className="text-slate-400">({columnEntries.length})</span>
              </h4>

              <div className="space-y-2">
                {columnEntries.map((entry) => (
                  <div
                    key={entry.pipelineCandidateId}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", entry.candidateId);
                      setDraggingId(entry.pipelineCandidateId);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className={`cursor-move rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm ${
                      draggingId === entry.pipelineCandidateId ? "opacity-50" : ""
                    }`}
                  >
                    <p className="font-semibold text-slate-800">{entry.candidate?.name ?? "Unknown candidate"}</p>
                    <p className="text-slate-500">{entry.candidate?.currentRole ?? "role unknown"}</p>
                    <p className="mt-1 text-slate-400">
                      ATS {entry.candidate?.scores.atsScore ?? "N/A"} · JD {entry.candidate?.scores.jdMatch ?? "N/A"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { jdMatchService } from "../job-description/jd-service";

import { firstEnteredAt } from "./candidate-stage";
import { CANDIDATE_STAGES, CandidateStage, PIPELINE_STAGES } from "./pipeline-schema";
import { PipelineAnalytics, PipelineCandidate } from "./pipeline-types";

const LOG_PREFIX = "[recruitment]";

// Deterministic, no LLM call — pure function over already-computed
// pipeline/candidate/JD-match data, same "compute what can be computed"
// discipline as every score/analytics module in this arc.

const SHORTLISTED_STAGES: CandidateStage[] = [
  "ATS Passed",
  "Technical Interview",
  "Manager Interview",
  "HR Interview",
  "Offer",
  "Hired",
];

function average(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.round(present.reduce((sum, value) => sum + value, 0) / present.length) : null;
}

export function computeAnalytics(pipelineCandidates: PipelineCandidate[], jobId: string | null): PipelineAnalytics {
  const applications = pipelineCandidates.length;
  const shortlisted = pipelineCandidates.filter((pc) => SHORTLISTED_STAGES.includes(pc.stage)).length;
  const rejected = pipelineCandidates.filter((pc) => pc.stage === "Rejected").length;
  const offers = pipelineCandidates.filter((pc) => pc.stage === "Offer" || pc.offerId !== null).length;
  const hired = pipelineCandidates.filter((pc) => pc.stage === "Hired").length;

  const atsScores: (number | null)[] = [];
  const jdMatchScores: (number | null)[] = [];
  const timeToHireDays: number[] = [];

  for (const pc of pipelineCandidates) {
    // Same job-specific-match discipline as jdMatchScores below — ATS
    // must reflect THIS job's own match (pc.jdMatchId), not Milestone
    // 8's workspace-level match on the candidate summary (which is
    // usually null unless a workspace JD happens to also be set).
    const jdMatchRecord = pc.jdMatchId ? jdMatchService.get(pc.jdMatchId) : undefined;
    atsScores.push(jdMatchRecord?.matchResult.atsScore ?? null);
    jdMatchScores.push(jdMatchRecord?.matchResult.overallMatch ?? null);

    if (pc.stage === "Hired") {
      const appliedAt = firstEnteredAt(pc, "Applied");
      const hiredAt = firstEnteredAt(pc, "Hired");

      if (appliedAt && hiredAt) {
        const days = (new Date(hiredAt).getTime() - new Date(appliedAt).getTime()) / (24 * 60 * 60 * 1000);
        timeToHireDays.push(days);
      }
    }
  }

  const stageDistribution = CANDIDATE_STAGES.map((stage) => ({
    stage,
    count: pipelineCandidates.filter((pc) => pc.stage === stage).length,
  }));

  const hiringFunnel = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: pipelineCandidates.filter((pc) => pc.stageHistory.some((entry) => entry.stage === stage)).length,
  }));

  const conversionRate = applications > 0 ? Math.round((hired / applications) * 100) : null;

  console.log(`${LOG_PREFIX} Analytics Generated`, { jobId, applications });

  return {
    jobId,
    applications,
    shortlisted,
    rejected,
    offers,
    hired,
    averageAts: average(atsScores),
    averageJdMatch: average(jdMatchScores),
    averageTimeToHireDays: timeToHireDays.length > 0 ? Math.round(timeToHireDays.reduce((sum, value) => sum + value, 0) / timeToHireDays.length) : null,
    conversionRate,
    stageDistribution,
    hiringFunnel,
  };
}

import { ActingRole, CandidateStage } from "./pipeline-schema";
import { PipelineCandidate } from "./pipeline-types";

// Deliberately unconstrained (plan design decision 3) — "allow drag
// and drop" means a candidate can move to any stage, forward,
// backward, or into Rejected, not a rigid state machine.

export function moveStage(pipelineCandidate: PipelineCandidate, stage: CandidateStage, actingRole: ActingRole | null = null): PipelineCandidate {
  pipelineCandidate.stage = stage;
  pipelineCandidate.stageHistory = [
    ...pipelineCandidate.stageHistory,
    { stage, enteredAt: new Date().toISOString(), actingRole },
  ];
  pipelineCandidate.updatedAt = new Date().toISOString();

  return pipelineCandidate;
}

/** Days since the candidate entered their current stage. */
export function daysInStage(pipelineCandidate: PipelineCandidate): number {
  const lastEntry = pipelineCandidate.stageHistory[pipelineCandidate.stageHistory.length - 1];
  const enteredAt = lastEntry ? new Date(lastEntry.enteredAt).getTime() : new Date(pipelineCandidate.createdAt).getTime();

  return Math.floor((Date.now() - enteredAt) / (24 * 60 * 60 * 1000));
}

/** A candidate is "stuck" once they've sat in a non-terminal stage longer than the threshold. */
export function isStuck(pipelineCandidate: PipelineCandidate, thresholdDays = 7): boolean {
  if (pipelineCandidate.stage === "Hired" || pipelineCandidate.stage === "Rejected") return false;
  return daysInStage(pipelineCandidate) >= thresholdDays;
}

/** First timestamp the candidate entered a given stage, if ever — used for time-to-hire math. */
export function firstEnteredAt(pipelineCandidate: PipelineCandidate, stage: CandidateStage): string | null {
  return pipelineCandidate.stageHistory.find((entry) => entry.stage === stage)?.enteredAt ?? null;
}

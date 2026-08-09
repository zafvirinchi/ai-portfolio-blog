import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { jdMatchService } from "../job-description/jd-service";
import { candidateService } from "../recruiter/candidate-service";

import { moveStage as applyStageMove } from "./candidate-stage";
import { generateHiringRecommendation } from "./hiring-recommendation";
import { jobService } from "./job-service";
import { notificationService } from "./notification-service";
import { ActingRole, CandidateStage, HiringRecommendation } from "./pipeline-schema";
import { Job, PipelineCandidate } from "./pipeline-types";

const LOG_PREFIX = "[recruitment]";

// Another boolean-flag singleton context, mirroring Milestone 8's
// recruiterRequestContext — the recruitment workspace has no single
// session ID to key on either (plan design decision 11).
export const recruitmentRequestContext = new AsyncLocalStorage<{ active: true }>();

// Synthesizes this job's structured fields into JD text for
// jdMatchService.analyze() (Milestone 1, read-only reuse) — see plan
// design decision 1: JD Match is recomputed per job, never inherited
// from Milestone 8's single workspace-wide JD.
function synthesizeJdText(job: Job): string {
  const lines = [
    `Job Title: ${job.title}`,
    job.department ? `Department: ${job.department}` : null,
    job.location ? `Location: ${job.location}` : null,
    `Employment Type: ${job.employmentType}`,
    job.experienceRequired ? `Experience Required: ${job.experienceRequired}` : null,
    job.salary ? `Salary: ${job.salary}` : null,
    job.requiredSkills.length > 0 ? `Required Skills: ${job.requiredSkills.join(", ")}` : null,
    job.preferredSkills.length > 0 ? `Preferred Skills (good to have): ${job.preferredSkills.join(", ")}` : null,
    job.education.length > 0 ? `Education: ${job.education.join(", ")}` : null,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

export class PipelineService {
  private readonly pipelineCandidates = new Map<string, PipelineCandidate>();

  // Same "expire on the upstream real record's own lifetime" discipline
  // Milestone 8 introduced — no independent timer.
  private purgeExpired(): void {
    for (const [id, pc] of this.pipelineCandidates) {
      if (!candidateService.get(pc.candidateId)) {
        this.pipelineCandidates.delete(id);
      }
    }
  }

  async attachCandidate(jobId: string, candidateId: string): Promise<PipelineCandidate> {
    const job = jobService.get(jobId);

    if (!job) {
      throw new Error("Job not found.");
    }

    const candidateRecord = candidateService.get(candidateId);

    if (!candidateRecord) {
      throw new Error("Candidate not found, or their resume has expired.");
    }

    const jdMatchRecord = await jdMatchService.analyze({
      resumeId: candidateRecord.resumeId,
      jd: { text: synthesizeJdText(job) },
    });

    const pipelineCandidateId = randomUUID();
    const now = new Date().toISOString();

    const pipelineCandidate: PipelineCandidate = {
      pipelineCandidateId,
      jobId,
      candidateId,
      stage: "Applied",
      stageHistory: [{ stage: "Applied", enteredAt: now, actingRole: null }],
      assignedRecruiter: job.recruiter,
      hiringManager: job.hiringManager,
      jdMatchId: jdMatchRecord.jdMatchId,
      hiringRecommendation: null,
      offerId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.pipelineCandidates.set(pipelineCandidateId, pipelineCandidate);

    const candidateName = candidateService.list().find((c) => c.candidateId === candidateId)?.name ?? "A candidate";

    // Reframed per plan design decision 4 — this package can't hook
    // into Milestone 8's protected import flow, so the closest honest
    // equivalent is "new to this job's pipeline."
    notificationService.emit({
      type: "New Resume Uploaded",
      message: `${candidateName} was added to the ${job.title} pipeline.`,
      jobId,
      pipelineCandidateId,
    });

    console.log(`${LOG_PREFIX} Pipeline Updated`, { jobId, pipelineCandidateId, action: "attached" });

    return pipelineCandidate;
  }

  list(jobId: string): PipelineCandidate[] {
    this.purgeExpired();
    return [...this.pipelineCandidates.values()].filter((pc) => pc.jobId === jobId);
  }

  listAll(): PipelineCandidate[] {
    this.purgeExpired();
    return [...this.pipelineCandidates.values()];
  }

  get(pipelineCandidateId: string): PipelineCandidate | undefined {
    this.purgeExpired();
    return this.pipelineCandidates.get(pipelineCandidateId);
  }

  getByJobAndCandidate(jobId: string, candidateId: string): PipelineCandidate | undefined {
    this.purgeExpired();
    return [...this.pipelineCandidates.values()].find((pc) => pc.jobId === jobId && pc.candidateId === candidateId);
  }

  changeStage(pipelineCandidateId: string, stage: CandidateStage, actingRole: ActingRole | null = null): PipelineCandidate {
    const pc = this.requirePipelineCandidate(pipelineCandidateId);
    const job = jobService.get(pc.jobId);
    const candidateName = candidateService.list().find((c) => c.candidateId === pc.candidateId)?.name ?? "A candidate";

    applyStageMove(pc, stage, actingRole);

    notificationService.emit({
      type: "Candidate Moved",
      message: `${candidateName} moved to ${stage}${job ? ` in ${job.title}` : ""}.`,
      jobId: pc.jobId,
      pipelineCandidateId,
    });

    console.log(`${LOG_PREFIX} Candidate Moved`, { pipelineCandidateId, stage });

    return pc;
  }

  assign(pipelineCandidateId: string, fields: { assignedRecruiter?: string | null; hiringManager?: string | null }): PipelineCandidate {
    const pc = this.requirePipelineCandidate(pipelineCandidateId);

    if (fields.assignedRecruiter !== undefined) pc.assignedRecruiter = fields.assignedRecruiter;
    if (fields.hiringManager !== undefined) pc.hiringManager = fields.hiringManager;
    pc.updatedAt = new Date().toISOString();

    return pc;
  }

  setOfferId(pipelineCandidateId: string, offerId: string | null): PipelineCandidate {
    const pc = this.requirePipelineCandidate(pipelineCandidateId);
    pc.offerId = offerId;
    pc.updatedAt = new Date().toISOString();
    return pc;
  }

  setHiringRecommendation(pipelineCandidateId: string, recommendation: HiringRecommendation): PipelineCandidate {
    const pc = this.requirePipelineCandidate(pipelineCandidateId);
    pc.hiringRecommendation = recommendation;
    pc.updatedAt = new Date().toISOString();
    return pc;
  }

  /** Thin passthrough to Milestone 8's own already-public method — see plan design decision 1. */
  async passthroughGenerateInterviewReadiness(candidateId: string) {
    return candidateService.generateInterviewReadiness(candidateId);
  }

  async generateHiringRecommendation(pipelineCandidateId: string): Promise<PipelineCandidate> {
    const pc = this.requirePipelineCandidate(pipelineCandidateId);
    const job = jobService.get(pc.jobId);

    if (!job) {
      throw new Error("Job not found.");
    }

    const profile = candidateService.getProfile(pc.candidateId);

    if (!profile) {
      throw new Error("Candidate not found, or their resume has expired.");
    }

    // Job-specific match (pc.jdMatchId), not Milestone 8's own
    // workspace-level match (profile.jdMatchResult) — see design
    // decision 1: JD Match is recomputed per job.
    const jdMatchRecord = pc.jdMatchId ? jdMatchService.get(pc.jdMatchId) : undefined;
    const recommendation = await generateHiringRecommendation(job, profile.resume, jdMatchRecord?.matchResult ?? null);
    pc.hiringRecommendation = recommendation;
    pc.updatedAt = new Date().toISOString();

    console.log(`${LOG_PREFIX} Recommendation Generated`, { pipelineCandidateId, classification: recommendation.classification });

    return pc;
  }

  private requirePipelineCandidate(pipelineCandidateId: string): PipelineCandidate {
    this.purgeExpired();
    const pc = this.pipelineCandidates.get(pipelineCandidateId);

    if (!pc) {
      throw new Error("Pipeline candidate not found, or their resume has expired.");
    }

    return pc;
  }
}

export const pipelineService = new PipelineService();

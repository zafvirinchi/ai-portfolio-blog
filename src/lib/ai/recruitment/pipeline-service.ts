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

  // Phase 16 Milestone 3 — candidateService moved from an ephemeral,
  // short-TTL in-memory store to a persistent, DB-backed one, so a
  // pipeline candidate's underlying CandidateRecord no longer silently
  // vanishes on its own short lifetime the way Milestone 8's original
  // in-memory store did. A genuinely recruiter-deleted candidate is a
  // referential-integrity edge case for this still-in-memory (and,
  // per Milestone 2's audit, still unauthenticated/out-of-scope)
  // Recruitment Pipeline package to handle in a future milestone —
  // this purge is intentionally a no-op now rather than a change that
  // would ripple every read method here into async.
  private purgeExpired(): void {}

  async attachCandidate(jobId: string, candidateId: string): Promise<PipelineCandidate> {
    const job = jobService.get(jobId);

    if (!job) {
      throw new Error("Job not found.");
    }

    const candidateRecord = await candidateService.getForSystemUse(candidateId);

    if (!candidateRecord || !candidateRecord.resumeId) {
      throw new Error("Candidate not found, or their cached resume data has expired.");
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

    const candidateName = (await candidateService.listForSystemUse()).find((c) => c.candidateId === candidateId)?.name ?? "A candidate";

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

  async changeStage(pipelineCandidateId: string, stage: CandidateStage, actingRole: ActingRole | null = null): Promise<PipelineCandidate> {
    const pc = this.requirePipelineCandidate(pipelineCandidateId);
    const job = jobService.get(pc.jobId);
    const candidateName = (await candidateService.listForSystemUse()).find((c) => c.candidateId === pc.candidateId)?.name ?? "A candidate";

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

  /**
   * Thin passthrough to Milestone 8's own already-public method — see
   * plan design decision 1. Phase 16 Milestone 2 scoped
   * generateInterviewReadiness() to a recruiterId; the Recruitment
   * Pipeline has no recruiter-identity concept of its own (job.recruiter
   * is a plain display string, not an authenticated actor), so this
   * passthrough resolves the candidate's OWN recruiterId via
   * getForSystemUse() rather than gaining a new, unrelated auth
   * requirement — documented as a known gap in PHASE16_MILESTONE2's
   * doc, not a silent scope change.
   */
  async passthroughGenerateInterviewReadiness(candidateId: string) {
    const record = await candidateService.getForSystemUse(candidateId);

    if (!record) {
      throw new Error("Candidate not found, or their resume has expired.");
    }

    return candidateService.generateInterviewReadiness(candidateId, record.recruiterId);
  }

  async generateHiringRecommendation(pipelineCandidateId: string): Promise<PipelineCandidate> {
    const pc = this.requirePipelineCandidate(pipelineCandidateId);
    const job = jobService.get(pc.jobId);

    if (!job) {
      throw new Error("Job not found.");
    }

    const candidateRecord = await candidateService.getForSystemUse(pc.candidateId);
    const profile = candidateRecord ? await candidateService.getProfile(pc.candidateId, candidateRecord.recruiterId) : undefined;

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

import { randomUUID } from "node:crypto";

import { EMPLOYMENT_TYPES, JobStatus } from "./pipeline-schema";
import { Job, JobCreateInput, JobUpdateInput } from "./pipeline-types";

const LOG_PREFIX = "[recruitment]";

// Jobs are workspace-level configuration, not tied to any single
// expiring resume/JD-match record (unlike PipelineCandidate) — no
// natural expiry signal exists, so (like Milestone 8's own
// activeJobDescriptionText) this store never expires entries on its
// own; it's still process-memory-only, same "no persistence layer
// yet" precedent as every other service in this arc.
export class JobService {
  private readonly jobs = new Map<string, Job>();

  create(input: JobCreateInput): Job {
    const jobId = randomUUID();
    const now = new Date().toISOString();

    const job: Job = {
      jobId,
      title: input.title,
      department: input.department ?? null,
      location: input.location ?? null,
      employmentType: input.employmentType ?? EMPLOYMENT_TYPES[0],
      experienceRequired: input.experienceRequired ?? null,
      salary: input.salary ?? null,
      requiredSkills: input.requiredSkills ?? [],
      preferredSkills: input.preferredSkills ?? [],
      education: input.education ?? [],
      noticePeriod: input.noticePeriod ?? null,
      hiringManager: input.hiringManager ?? null,
      recruiter: input.recruiter ?? null,
      status: "Draft",
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(jobId, job);
    console.log(`${LOG_PREFIX} Job Created`, { jobId, title: job.title });

    return job;
  }

  update(jobId: string, input: JobUpdateInput): Job {
    const job = this.requireJob(jobId);

    if (input.title !== undefined) job.title = input.title;
    if (input.department !== undefined) job.department = input.department;
    if (input.location !== undefined) job.location = input.location;
    if (input.employmentType !== undefined) job.employmentType = input.employmentType;
    if (input.experienceRequired !== undefined) job.experienceRequired = input.experienceRequired;
    if (input.salary !== undefined) job.salary = input.salary;
    if (input.requiredSkills !== undefined) job.requiredSkills = input.requiredSkills;
    if (input.preferredSkills !== undefined) job.preferredSkills = input.preferredSkills;
    if (input.education !== undefined) job.education = input.education;
    if (input.noticePeriod !== undefined) job.noticePeriod = input.noticePeriod;
    if (input.hiringManager !== undefined) job.hiringManager = input.hiringManager;
    if (input.recruiter !== undefined) job.recruiter = input.recruiter;

    job.updatedAt = new Date().toISOString();

    return job;
  }

  duplicate(jobId: string): Job {
    const original = this.requireJob(jobId);

    return this.create({
      title: `${original.title} (Copy)`,
      department: original.department,
      location: original.location,
      employmentType: original.employmentType,
      experienceRequired: original.experienceRequired,
      salary: original.salary,
      requiredSkills: [...original.requiredSkills],
      preferredSkills: [...original.preferredSkills],
      education: [...original.education],
      noticePeriod: original.noticePeriod,
      hiringManager: original.hiringManager,
      recruiter: original.recruiter,
    });
  }

  setStatus(jobId: string, status: JobStatus): Job {
    const job = this.requireJob(jobId);
    job.status = status;
    job.updatedAt = new Date().toISOString();
    return job;
  }

  archive(jobId: string): Job {
    return this.setStatus(jobId, "Archived");
  }

  close(jobId: string): Job {
    return this.setStatus(jobId, "Closed");
  }

  reopen(jobId: string): Job {
    return this.setStatus(jobId, "Open");
  }

  delete(jobId: string): void {
    this.jobs.delete(jobId);
  }

  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  findByTitleFragment(fragment: string): Job[] {
    const lower = fragment.toLowerCase();
    return this.list().filter((job) => job.title.toLowerCase().includes(lower));
  }

  private requireJob(jobId: string): Job {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error("Job not found.");
    }

    return job;
  }
}

export const jobService = new JobService();

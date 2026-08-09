import { randomUUID } from "node:crypto";

import { jobParser } from "./job-parser";
import { JobDescription } from "./job-schema";
import { JobRecord, JobUploadInput } from "./job-types";

const LOG_PREFIX = "[job-agent]";

// Same in-memory-with-TTL pattern resume/resume-service.ts uses — parsed
// job descriptions live only in process memory, never persisted.
const JOB_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StoredJobRecord {
  record: JobRecord;
  expiresAt: number;
}

export class JobService {
  private readonly records = new Map<string, StoredJobRecord>();

  private purgeExpired(): void {
    const now = Date.now();

    for (const [id, entry] of this.records) {
      if (entry.expiresAt <= now) {
        this.records.delete(id);
      }
    }
  }

  private store(filename: string, jobDescription: JobDescription, startedAt: number): JobRecord {
    console.log(`${LOG_PREFIX} Job normalized`, { filename });

    const jobId = randomUUID();

    const record: JobRecord = {
      jobId,
      filename,
      uploadedAt: new Date().toISOString(),
      jobDescription,
      processingTimeMs: Date.now() - startedAt,
    };

    this.purgeExpired();
    this.records.set(jobId, { record, expiresAt: Date.now() + JOB_TTL_MS });

    console.log(`${LOG_PREFIX} Job completed`, { jobId, processingTimeMs: record.processingTimeMs });

    return record;
  }

  async parseFile(input: JobUploadInput): Promise<JobRecord> {
    const startedAt = Date.now();

    console.log(`${LOG_PREFIX} Job uploaded`, { filename: input.filename });

    const jobDescription = await jobParser.parseFile(input);

    console.log(`${LOG_PREFIX} Job parsed`, {
      filename: input.filename,
      jobTitle: jobDescription.jobTitle,
      skillCount: jobDescription.requiredSkills.length,
    });

    return this.store(input.filename, jobDescription, startedAt);
  }

  async parseText(text: string): Promise<JobRecord> {
    const startedAt = Date.now();
    const filename = "Pasted Job Description";

    console.log(`${LOG_PREFIX} Job uploaded`, { filename });

    const jobDescription = await jobParser.parseText(text);

    console.log(`${LOG_PREFIX} Job parsed`, {
      filename,
      jobTitle: jobDescription.jobTitle,
      skillCount: jobDescription.requiredSkills.length,
    });

    return this.store(filename, jobDescription, startedAt);
  }

  /** Generic entry point: a file input or raw pasted text, whichever the caller has. */
  async parse(input: JobUploadInput | string): Promise<JobRecord> {
    return typeof input === "string" ? this.parseText(input) : this.parseFile(input);
  }

  get(jobId: string): JobRecord | undefined {
    this.purgeExpired();

    return this.records.get(jobId)?.record;
  }
}

export const jobService = new JobService();

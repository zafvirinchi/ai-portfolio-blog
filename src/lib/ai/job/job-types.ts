import { JobDescription } from "./job-schema";

// Non-schema wrapper types — mirrors resume/resume-types.ts's role.

export interface JobUploadInput {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
}

export interface JobParseResult {
  jobId: string;
  filename: string;
  uploadedAt: string;
  jobDescription: JobDescription;
  processingTimeMs: number;
}

export type JobRecord = JobParseResult;

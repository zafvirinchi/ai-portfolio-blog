import { JobDescription } from "../job-description/jd-schema";

// Non-schema row/wrapper types — mirrors resume-versions/resume-version-types.ts's role.

export const RECRUITER_JOB_STATUSES = ["Active", "Closed", "Archived"] as const;
export type RecruiterJobStatus = (typeof RECRUITER_JOB_STATUSES)[number];

/** Raw `recruiter_jobs` row shape, snake_case — exactly as stored/read via supabaseAdmin. */
export interface RecruiterJobRow {
  id: string;
  recruiter_id: string;
  title: string;
  company: string | null;
  job_description_text: string;
  normalized_jd: JobDescription | null;
  status: RecruiterJobStatus;
  created_at: string;
  updated_at: string;
}

/** camelCase shape every service method / API route returns. */
export interface RecruiterJobRecord {
  id: string;
  recruiterId: string;
  title: string;
  company: string | null;
  jobDescriptionText: string;
  normalizedJd: JobDescription | null;
  status: RecruiterJobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobInput {
  title: string;
  company?: string | null;
  jobDescriptionText: string;
}

export interface UpdateJobInput {
  title?: string;
  company?: string | null;
  jobDescriptionText?: string;
  status?: RecruiterJobStatus;
}

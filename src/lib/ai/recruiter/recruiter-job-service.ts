import { supabaseAdmin } from "../../supabase/admin";
import { jdParser } from "../job-description/jd-parser";
import { JobDescription } from "../job-description/jd-schema";

import { CreateJobInput, RecruiterJobRecord, RecruiterJobRow, UpdateJobInput } from "./recruiter-job-types";

const LOG_PREFIX = "[recruiter-job]";
const TABLE = "recruiter_jobs";

/** Thrown for both "no such job" and "job belongs to another recruiter" — always the same message/status (404), matching CandidateNotFoundError's convention (candidate-service.ts) so a response never leaks whether a jobId exists at all. */
export class RecruiterJobNotFoundError extends Error {
  constructor() {
    super("Job not found.");
    this.name = "RecruiterJobNotFoundError";
  }
}

function toRecord(row: RecruiterJobRow): RecruiterJobRecord {
  return {
    id: row.id,
    recruiterId: row.recruiter_id,
    title: row.title,
    company: row.company,
    jobDescriptionText: row.job_description_text,
    normalizedJd: row.normalized_jd,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RecruiterJobService {
  /** Every existing job row for this recruiter, newest first. Zero AI calls. */
  async listJobs(recruiterId: string): Promise<RecruiterJobRecord[]> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("recruiter_id", recruiterId).order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return ((data ?? []) as RecruiterJobRow[]).map(toRecord);
  }

  /** Throws RecruiterJobNotFoundError (never leaks whether a row exists for a different recruiter) unless this exact row belongs to recruiterId — the sole ownership check every other method in this service routes through. */
  async getJob(recruiterId: string, jobId: string): Promise<RecruiterJobRecord> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("id", jobId).eq("recruiter_id", recruiterId).maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new RecruiterJobNotFoundError();

    return toRecord(data as RecruiterJobRow);
  }

  /** Reuses jd-parser.ts (Phase 13's existing JD parser, one LLM call) to normalize the pasted JD once at creation time — every subsequent match against this job reuses normalizedJd rather than re-parsing (see job-description/jd-service.ts's computeJdMatchForNormalizedJd). */
  async createJob(recruiterId: string, input: CreateJobInput): Promise<RecruiterJobRecord> {
    const jobDescriptionText = input.jobDescriptionText.trim();
    const normalizedJd = await jdParser.parse({ text: jobDescriptionText });

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({
        recruiter_id: recruiterId,
        title: input.title.trim(),
        company: input.company?.trim() || null,
        job_description_text: jobDescriptionText,
        normalized_jd: normalizedJd,
        status: "Active",
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    console.log(`${LOG_PREFIX} Job Created`, { recruiterId, jobId: data.id, title: data.title });

    return toRecord(data as RecruiterJobRow);
  }

  /** Only re-parses (one LLM call) when jobDescriptionText actually changed — editing just the title/company/status never re-invokes the JD parser. */
  async updateJob(recruiterId: string, jobId: string, input: UpdateJobInput): Promise<RecruiterJobRecord> {
    const existing = await this.getJob(recruiterId, jobId);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.company !== undefined) patch.company = input.company?.trim() || null;
    if (input.status !== undefined) patch.status = input.status;

    if (input.jobDescriptionText !== undefined) {
      const jobDescriptionText = input.jobDescriptionText.trim();

      if (jobDescriptionText !== existing.jobDescriptionText) {
        const normalizedJd: JobDescription = await jdParser.parse({ text: jobDescriptionText });
        patch.job_description_text = jobDescriptionText;
        patch.normalized_jd = normalizedJd;
      }
    }

    const { data, error } = await supabaseAdmin.from(TABLE).update(patch).eq("id", jobId).eq("recruiter_id", recruiterId).select("*").single();

    if (error) throw new Error(error.message);

    return toRecord(data as RecruiterJobRow);
  }

  /** Candidates attached to this job keep their own record — job_id is set null via the FK's ON DELETE SET NULL, never cascaded (see PHASE16_MILESTONE3 doc §22). */
  async deleteJob(recruiterId: string, jobId: string): Promise<void> {
    await this.getJob(recruiterId, jobId); // ownership check

    const { error } = await supabaseAdmin.from(TABLE).delete().eq("id", jobId).eq("recruiter_id", recruiterId);

    if (error) throw new Error(error.message);

    console.log(`${LOG_PREFIX} Job Deleted`, { recruiterId, jobId });
  }
}

export const recruiterJobService = new RecruiterJobService();

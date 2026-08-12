import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { supabaseAdmin } from "../../supabase/admin";
import { jdMatchService } from "../job-description/jd-service";
import { JdMatchResult } from "../job-description/jd-schema";
import { AtsCategoryScores } from "../job-description/jd-types";
import { prepService } from "../interview-prep/prep-service";
import { resumeService } from "../resume/resume-service";
import { explainJdAtsCategories } from "../resume-versions/dynamic/ats-explainability";

import { buildComparisonTable, generateComparisonRecommendation } from "./candidate-comparison";
import {
  CandidateExportContext,
  renderCandidateListCsv,
  renderCandidateListExcel,
  renderCandidateListPdf,
  renderCandidateReportPdf,
  renderComparisonCsv,
  renderComparisonExcel,
} from "./candidate-export";
import { generateCandidateInsights } from "./candidate-insights";
import { classifyCandidateFitLevel, computeRankingScore, rankCandidates } from "./candidate-ranking";
import { generateTopCandidatesRecommendation } from "./candidate-recommendation";
import { buildRecruiterSummary, recommendRecruiterAction } from "./candidate-summary";
import { CANDIDATE_TAGS, CandidateStatus, CandidateTag, NoteCategory, NoteEntry, isValidStatusTransition } from "./candidate-schema";
import { computeScoreBreakdown } from "./candidate-score";
import { recruiterJobService } from "./recruiter-job-service";
import { suggestTags } from "./candidate-tags";
import {
  CandidateImportFile,
  CandidateImportResult,
  CandidateProfile,
  CandidateRecord,
  CandidateRow,
  CandidateSummary,
  ComparisonResult,
  ComparisonRow,
  DashboardSummary,
  DecisionHistoryEntry,
  EvaluationStatus,
  RankedCandidate,
  TopCandidatesRecommendation,
} from "./candidate-types";

const LOG_PREFIX = "[recruiter]";
const TABLE = "recruiter_candidates";

/** Thrown for both "no such candidate" and "candidate belongs to another recruiter" — always the same message/status (404), so a response never leaks whether a candidateId exists at all (Milestone 2, §14). */
export class CandidateNotFoundError extends Error {
  constructor() {
    super("Candidate not found.");
    this.name = "CandidateNotFoundError";
  }
}

// Recruiter chat has no per-record ID to key on beyond the recruiter's
// own identity — this context carries the server-derived recruiterId
// (Milestone 2). recruiterId is null when recruiterMode was requested
// but the request has no signed-in session.
export const recruiterRequestContext = new AsyncLocalStorage<{ active: true; recruiterId: string | null }>();

/**
 * Phase 16 Milestone 3, §17 — a lightweight, NON-persisted compatibility
 * adapter. prepService.generate() (protected, unmodified Interview
 * Prep architecture) only accepts LIVE resumeService/jdMatchService
 * ephemeral ids, never already-computed data directly. This
 * process-local cache remembers the ephemeral ids produced at import/
 * match time so "Generate Interview Readiness" keeps working within
 * their original ~2h window — the exact same window this action
 * already had before persistence (a candidate whose resume/JD-match
 * data had already aged out of the ephemeral store could never
 * generate interview readiness before either; the only change here is
 * that the candidate record itself no longer disappears alongside it).
 * Once either id's TTL expires this action fails with a clear, honest
 * error rather than silently regenerating via a fresh LLM call.
 */
const ephemeralPointers = new Map<string, { resumeId: string; jdMatchId: string | null }>();

function toRecord(row: CandidateRow): CandidateRecord {
  return {
    candidateId: row.id,
    recruiterId: row.recruiter_id,
    jobId: row.job_id,
    filename: row.filename,
    resumeId: row.resume_id,
    resumeData: row.resume_data,
    atsScore: row.ats_score,
    jdMatchResult: row.jd_match_result,
    interviewReadinessScore: row.interview_readiness_score,
    insights: row.insights,
    status: row.status,
    tags: row.tags,
    notes: row.notes,
    decisionHistory: row.decision_history ?? [],
    noticePeriod: row.notice_period,
    expectedSalary: row.expected_salary,
    evaluatedAt: row.evaluated_at,
    importedAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Phase 16 Milestone 4, §9 — small field-name adapter onto the existing (Phase 15) resume-versions/dynamic/ats-explainability.ts's AtsCategoryScores shape; no new scoring, just a rename so the existing per-category explainer can read JdMatchResult's fields. */
function toAtsCategoryScores(jdMatch: JdMatchResult): AtsCategoryScores {
  return {
    overall: jdMatch.atsScore,
    keyword: jdMatch.keywordScore,
    experience: jdMatch.experienceScore,
    education: jdMatch.educationScore,
    formatting: jdMatch.formattingScore,
    achievement: jdMatch.achievementScore,
    project: jdMatch.projectScore,
    leadership: jdMatch.leadershipScore,
    certification: jdMatch.certificationScore,
    aiSkills: jdMatch.aiScore,
    cloud: jdMatch.cloudScore,
    security: jdMatch.securityScore,
    softSkills: jdMatch.softSkillsScore,
  };
}

/**
 * Phase 16 Milestone 4, §20 — deterministic, timestamp-based staleness
 * check. jobUpdatedAt is the attached job's OWN updatedAt (fetched by
 * the caller — see list()/getProfile() — never re-queried per
 * candidate, so this stays free of N+1 queries). ISO 8601 UTC strings
 * compare correctly with plain string comparison.
 */
function resolveEvaluationStatus(record: CandidateRecord, jobUpdatedAt: string | null | undefined): EvaluationStatus {
  if (!record.jobId || !record.jdMatchResult) return "not_evaluated";
  if (jobUpdatedAt && record.evaluatedAt && jobUpdatedAt > record.evaluatedAt) return "stale";
  return "complete";
}

function toSummary(record: CandidateRecord, jobUpdatedAt?: string | null): CandidateSummary {
  const resume = record.resumeData;
  const currentJob = resume.workExperience.find((job) => job.isCurrent) ?? resume.workExperience[0];
  const scores = computeScoreBreakdown({
    resume,
    resumeAtsScore: record.atsScore,
    jdMatch: record.jdMatchResult,
    interviewReadiness: record.interviewReadinessScore,
  });

  // §11 — Milestone 1's own Candidate Fit engine, reused verbatim (no new weights), now surfaced per-candidate rather than only inside a ranking list.
  const fitScore = computeRankingScore(scores);
  const fitLevel = classifyCandidateFitLevel(fitScore);

  return {
    candidateId: record.candidateId,
    jobId: record.jobId,
    name: resume.contact.name ?? record.filename,
    email: resume.contact.email ?? null,
    phone: resume.contact.phone ?? null,
    currentRole: currentJob?.title ?? null,
    currentCompany: currentJob?.company ?? null,
    experienceYears: resume.yearsOfExperience,
    location: resume.contact.location ?? currentJob?.location ?? null,
    noticePeriod: record.noticePeriod,
    expectedSalary: record.expectedSalary,
    status: record.status,
    tags: record.tags,
    scores,
    importedAt: record.importedAt,
    evaluatedAt: record.evaluatedAt,
    fitScore,
    fitLevel,
    // Phase 16 Milestone 5, §13 — same fixed, deterministic lookup Milestone 4 already uses inside buildRecruiterSummary(); surfaced directly on the summary too so the screening list/CSV export don't need a full profile fetch just to show it. Informational only — never auto-applied to status (§13's explicit caution).
    recommendedAction: recommendRecruiterAction(fitLevel),
    evaluationStatus: resolveEvaluationStatus(record, jobUpdatedAt),
  };
}

function toProfile(record: CandidateRecord, jobUpdatedAt?: string | null): CandidateProfile {
  const summary = toSummary(record, jobUpdatedAt);

  return {
    summary,
    record,
    resume: record.resumeData,
    jdMatchResult: record.jdMatchResult,
    recruiterSummary: buildRecruiterSummary(record.resumeData, record.jdMatchResult, summary.scores),
    atsExplanation: record.jdMatchResult ? explainJdAtsCategories(toAtsCategoryScores(record.jdMatchResult)) : null,
  };
}

function bumpCount(map: Map<string, number>, rawKey: string): void {
  const key = rawKey.trim();
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Phase 16 Milestone 7, §7 — recruiterId is always the server-derived value already threaded through updateStatus()/bulkUpdateStatus(), never re-read from anywhere client-controlled. */
function buildDecisionHistoryEntry(recruiterId: string, previousStatus: CandidateStatus, newStatus: CandidateStatus, note?: string): DecisionHistoryEntry {
  return {
    id: randomUUID(),
    recruiterId,
    previousStatus,
    newStatus,
    note: note?.trim() || null,
    timestamp: new Date().toISOString(),
  };
}

export class CandidateService {
  // -------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------

  /** The sole ownership check every scoped method routes through — throws CandidateNotFoundError unless this exact row belongs to recruiterId (Milestone 2, §9/§14). */
  private async requireRecord(candidateId: string, recruiterId: string): Promise<CandidateRecord> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("id", candidateId).eq("recruiter_id", recruiterId).maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new CandidateNotFoundError();

    return toRecord(data as CandidateRow);
  }

  private async update(candidateId: string, recruiterId: string, patch: Record<string, unknown>): Promise<CandidateRecord> {
    await this.requireRecord(candidateId, recruiterId); // ownership check

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", candidateId)
      .eq("recruiter_id", recruiterId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return toRecord(data as CandidateRow);
  }

  private purgeExpiredPointers(): void {
    for (const [candidateId, pointers] of ephemeralPointers) {
      if (!resumeService.get(pointers.resumeId)) {
        ephemeralPointers.delete(candidateId);
      }
    }
  }

  // -------------------------------------------------------------------
  // Import & JD matching
  // -------------------------------------------------------------------

  /**
   * Phase 16 Milestone 4, §7 — deterministic, no LLM call. "Same
   * candidate" = same recruiter + same job attachment (including
   * unattached, i.e. jobId null) + same resume contact email. Scoped
   * to the calling recruiter only (a single .eq("recruiter_id", ...)
   * query, filtered further in-memory over that one recruiter's own
   * small candidate pool — never a cross-recruiter scan), so this can
   * never reveal whether another recruiter already has the same
   * candidate.
   */
  private async findDuplicate(recruiterId: string, jobId: string | null, email: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("id, job_id, resume_data").eq("recruiter_id", recruiterId);
    if (error) throw new Error(error.message);

    const match = ((data ?? []) as { id: string; job_id: string | null; resume_data: CandidateRow["resume_data"] }[]).find(
      (row) => row.job_id === jobId && row.resume_data.contact.email?.trim().toLowerCase() === email
    );

    return match?.id ?? null;
  }

  /** jobId is optional — a candidate can be imported unattached and matched later. When given, must be a job recruiterId genuinely owns (recruiterJobService enforces this) — the same ownership check that makes "attach another recruiter's candidate to my job" (or vice versa) impossible. */
  async importResumes(recruiterId: string, files: CandidateImportFile[], jobId: string | null = null): Promise<CandidateImportResult> {
    const imported: CandidateSummary[] = [];
    const duplicates: { filename: string; existingCandidateId: string }[] = [];
    const failed: { filename: string; error: string }[] = [];

    const job = jobId ? await recruiterJobService.getJob(recruiterId, jobId) : null;

    for (const file of files) {
      try {
        const resumeRecord = await resumeService.analyzeUpload(file);

        const email = resumeRecord.resume.contact.email?.trim().toLowerCase() || null;

        if (email) {
          const existingCandidateId = await this.findDuplicate(recruiterId, job?.id ?? null, email);

          if (existingCandidateId) {
            duplicates.push({ filename: file.filename, existingCandidateId });
            continue;
          }
        }

        let jdMatchResult = null;
        let jdMatchId: string | null = null;

        if (job) {
          const jdMatchRecord = await jdMatchService.analyze({ resumeId: resumeRecord.resumeId, jd: { text: job.jobDescriptionText } });
          jdMatchResult = jdMatchRecord.matchResult;
          jdMatchId = jdMatchRecord.jdMatchId;
        }

        const { data, error } = await supabaseAdmin
          .from(TABLE)
          .insert({
            recruiter_id: recruiterId,
            job_id: job?.id ?? null,
            filename: file.filename,
            resume_id: resumeRecord.resumeId,
            resume_data: resumeRecord.resume,
            ats_score: resumeRecord.atsScore.overall,
            jd_match_result: jdMatchResult,
            interview_readiness_score: null,
            insights: null,
            status: "Pending Review",
            tags: suggestTags(resumeRecord.resume),
            notes: [],
            decision_history: [],
            notice_period: null,
            expected_salary: null,
            evaluated_at: jdMatchResult ? new Date().toISOString() : null,
          })
          .select("*")
          .single();

        if (error) throw new Error(error.message);

        const record = toRecord(data as CandidateRow);
        ephemeralPointers.set(record.candidateId, { resumeId: resumeRecord.resumeId, jdMatchId });

        console.log(`${LOG_PREFIX} Candidate Imported`, { candidateId: record.candidateId, filename: file.filename });

        imported.push(toSummary(record, job?.updatedAt ?? null));
      } catch (error) {
        failed.push({ filename: file.filename, error: error instanceof Error ? error.message : "Import failed" });
      }
    }

    return { imported, duplicates, failed };
  }

  /** Explicit, per-job matching — replaces Milestone 2's single ambient per-recruiter active JD (see PHASE16_MILESTONE3 doc §4). jobId must be a job recruiterId owns; candidateId must be a candidate recruiterId owns — both checked before any LLM call runs. */
  async matchCandidate(candidateId: string, recruiterId: string, jobId: string): Promise<CandidateRecord> {
    const record = await this.requireRecord(candidateId, recruiterId);
    const job = await recruiterJobService.getJob(recruiterId, jobId); // ownership check — Recruiter A can never attach Recruiter B's job

    if (!record.resumeId || !resumeService.get(record.resumeId)) {
      throw new Error("This candidate's cached resume data has expired — re-import the resume before matching against a job.");
    }

    const jdMatchRecord = await jdMatchService.analyze({ resumeId: record.resumeId, jd: { text: job.jobDescriptionText } });
    ephemeralPointers.set(candidateId, { resumeId: record.resumeId, jdMatchId: jdMatchRecord.jdMatchId });

    return this.update(candidateId, recruiterId, { job_id: job.id, jd_match_result: jdMatchRecord.matchResult, evaluated_at: new Date().toISOString() });
  }

  /**
   * Phase 16 Milestone 4, §21 — the explicit "Re-evaluate Candidate"
   * recruiter action. Re-runs the match against the candidate's OWN
   * currently-attached job only — never an externally supplied jobId
   * — so this can never violate the job/candidate/recruiter
   * consistency invariant (§25): the job this re-evaluates against is
   * always the same one already verified to belong to this recruiter
   * when the candidate was first matched.
   */
  async reEvaluateCandidate(candidateId: string, recruiterId: string): Promise<CandidateRecord> {
    const record = await this.requireRecord(candidateId, recruiterId);

    if (!record.jobId) {
      throw new Error("Attach this candidate to a job before re-evaluating.");
    }

    return this.matchCandidate(candidateId, recruiterId, record.jobId);
  }

  // -------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------

  /** Phase 16 Milestone 5 — options.jobId scopes the query itself (server-side .eq("job_id", ...)), not a client-side filter over every candidate, so the job-centric screening view never fetches other jobs' candidates just to discard them. */
  async list(recruiterId: string, options: { jobId?: string } = {}): Promise<CandidateSummary[]> {
    let query = supabaseAdmin.from(TABLE).select("*").eq("recruiter_id", recruiterId);
    if (options.jobId) query = query.eq("job_id", options.jobId);

    const [{ data, error }, jobs] = await Promise.all([
      query.order("created_at", { ascending: false }),
      recruiterJobService.listJobs(recruiterId),
    ]);

    if (error) throw new Error(error.message);

    // One extra recruiter-scoped query for every job's updatedAt, not
    // one per candidate — avoids N+1 while still letting every
    // candidate's evaluationStatus reflect its own job's freshness.
    const jobUpdatedAtById = new Map(jobs.map((job) => [job.id, job.updatedAt]));

    return ((data ?? []) as CandidateRow[]).map((row) => {
      const record = toRecord(row);
      return toSummary(record, record.jobId ? jobUpdatedAtById.get(record.jobId) : null);
    });
  }

  /**
   * Phase 16 Milestone 9, §3 — "Export Selected." Same atomic
   * ownership pattern bulkUpdateStatus() already established
   * (Milestone 5/7): fetches every requested id scoped by
   * recruiter_id, and if the returned count doesn't match the
   * requested count — one or more ids don't exist, or belong to
   * another recruiter — throws CandidateNotFoundError and returns
   * NOTHING (never a partial export, never a hint about which id was
   * foreign).
   */
  async listByIds(recruiterId: string, candidateIds: string[]): Promise<CandidateSummary[]> {
    if (candidateIds.length === 0) {
      throw new Error("Select at least one candidate to export.");
    }

    const [{ data, error }, jobs] = await Promise.all([
      supabaseAdmin.from(TABLE).select("*").eq("recruiter_id", recruiterId).in("id", candidateIds),
      recruiterJobService.listJobs(recruiterId),
    ]);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as CandidateRow[];
    if (rows.length !== candidateIds.length) {
      throw new CandidateNotFoundError();
    }

    const jobUpdatedAtById = new Map(jobs.map((job) => [job.id, job.updatedAt]));

    return rows.map((row) => {
      const record = toRecord(row);
      return toSummary(record, record.jobId ? jobUpdatedAtById.get(record.jobId) : null);
    });
  }

  async get(candidateId: string, recruiterId: string): Promise<CandidateRecord | undefined> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("id", candidateId).eq("recruiter_id", recruiterId).maybeSingle();

    if (error) throw new Error(error.message);

    return data ? toRecord(data as CandidateRow) : undefined;
  }

  /**
   * Unscoped, for other in-process services only (currently
   * pipeline-service.ts's Recruitment Pipeline — Phase 13 Milestone 9,
   * a sibling feature with its own separate, not-yet-authenticated
   * actor model that is out of this milestone's scope to redesign).
   * Never call this from an API route — it bypasses ownership
   * entirely and must stay internal-only.
   */
  async getForSystemUse(candidateId: string): Promise<CandidateRecord | undefined> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("id", candidateId).maybeSingle();

    if (error) throw new Error(error.message);

    return data ? toRecord(data as CandidateRow) : undefined;
  }

  /** Unscoped counterpart to list() — see getForSystemUse()'s doc comment. Internal-only. */
  async listForSystemUse(): Promise<CandidateSummary[]> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*").order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return ((data ?? []) as CandidateRow[]).map((row) => toSummary(toRecord(row)));
  }

  /** Unscoped counterpart to searchBySkill() — see getForSystemUse()'s doc comment. Internal-only. */
  async searchBySkillForSystemUse(term: string): Promise<CandidateSummary[]> {
    const all = await this.listForSystemUseRecords();
    return this.filterBySkill(all, term);
  }

  private async listForSystemUseRecords(): Promise<CandidateRecord[]> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*");
    if (error) throw new Error(error.message);
    return ((data ?? []) as CandidateRow[]).map(toRecord);
  }

  private filterBySkill(records: CandidateRecord[], term: string): CandidateSummary[] {
    const lower = term.toLowerCase();

    return records
      .filter((record) => [...record.resumeData.skills, ...record.resumeData.technicalSkills].join(" ").toLowerCase().includes(lower))
      .map((record) => toSummary(record));
  }

  async getProfile(candidateId: string, recruiterId: string): Promise<CandidateProfile | undefined> {
    const record = await this.get(candidateId, recruiterId);
    if (!record) return undefined;

    // Defensive: record.jobId (when set) was only ever written through
    // an ownership-checked match against a job this same recruiter
    // owns, so this lookup should always succeed — the fallback just
    // means a profile still renders (without staleness precision)
    // rather than failing outright on an unexpected race.
    const job = record.jobId ? await recruiterJobService.getJob(recruiterId, record.jobId).catch(() => null) : null;

    return toProfile(record, job?.updatedAt ?? null);
  }

  /** Unscoped counterpart to getProfile() — see getForSystemUse()'s doc comment. Internal-only. Staleness is not computed here (no unscoped job lookup exists, and this path's only consumer — the Recruitment Pipeline — has no use for it); a matched candidate is treated as "complete". */
  async getProfileForSystemUse(candidateId: string): Promise<CandidateProfile | undefined> {
    const record = await this.getForSystemUse(candidateId);
    return record ? toProfile(record) : undefined;
  }

  /** Used by resume.tool.ts's "compare X and Y" chat command. */
  async findByNameFragment(fragment: string, recruiterId: string): Promise<CandidateSummary[]> {
    const lower = fragment.toLowerCase();
    const summaries = await this.list(recruiterId);
    return summaries.filter((candidate) => candidate.name.toLowerCase().includes(lower));
  }

  /** Used by resume.tool.ts's "who has X experience" chat command — checks real skill lists, not just the fixed tag palette. */
  async searchBySkill(term: string, recruiterId: string): Promise<CandidateSummary[]> {
    const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("recruiter_id", recruiterId);
    if (error) throw new Error(error.message);

    return this.filterBySkill(((data ?? []) as CandidateRow[]).map(toRecord), term);
  }

  /** Used by resume.tool.ts's "who is ready for interview" chat command. */
  async findReadyForInterview(recruiterId: string, threshold = 60): Promise<CandidateSummary[]> {
    const summaries = await this.list(recruiterId);
    return summaries.filter((candidate) => candidate.scores.interviewReadiness !== null && candidate.scores.interviewReadiness >= threshold);
  }

  // -------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------

  /**
   * Phase 16 Milestone 7, §1/§6 — every status change is validated
   * against ALLOWED_STATUS_TRANSITIONS before being written (a
   * same-status call, e.g. shortlisting an already-Shortlisted
   * candidate, is always valid — §14's idempotency requirement) and
   * automatically appends a decision_history entry. `note`, when
   * given, reuses the EXISTING notes mechanism (candidate-schema.ts's
   * NoteEntry, category "Recruiter") rather than a new note store —
   * it is never sent to an LLM.
   */
  async updateStatus(candidateId: string, recruiterId: string, status: CandidateStatus, note?: string): Promise<CandidateRecord> {
    const record = await this.requireRecord(candidateId, recruiterId);

    if (!isValidStatusTransition(record.status, status)) {
      throw new Error(`Cannot move a candidate from "${record.status}" to "${status}".`);
    }

    const patch: Record<string, unknown> = {
      status,
      decision_history: [...record.decisionHistory, buildDecisionHistoryEntry(recruiterId, record.status, status, note)],
    };

    if (note?.trim()) {
      const noteEntry: NoteEntry = { id: randomUUID(), category: "Recruiter", text: note.trim(), createdAt: new Date().toISOString() };
      patch.notes = [...record.notes, noteEntry];
    }

    return this.update(candidateId, recruiterId, patch);
  }

  /**
   * Phase 16 Milestone 5, §10/§24 — reuses the same updateStatus()
   * semantics, batched. Ownership AND transition validity of EVERY
   * candidateId is verified BEFORE any row is mutated — if even one id
   * doesn't exist, belongs to another recruiter, or can't legally
   * reach the target status from its own current status, the whole
   * operation is rejected and nothing is written (never "update the
   * ones that succeeded, then fail on the last one"). The rejection is
   * the same CandidateNotFoundError every other method throws for the
   * ownership case — it never reveals which specific id was the
   * problem, or whether it exists for someone else.
   *
   * Known limitation (§7 of the milestone doc): each candidate needs
   * its own decision_history entry (a different previousStatus per
   * row), so — after every row passes validation — this issues one
   * UPDATE per candidate rather than a single batched statement (this
   * project has no exposed multi-row-transaction API via supabase-js).
   * All validation happens upfront, before any write, so there is no
   * risk of a LATER validation failure causing a partial mutation; the
   * only residual (pre-existing-class) risk is a genuine mid-loop
   * database error, the same class of risk every other multi-step
   * write in this codebase already carries without a transaction API.
   */
  async bulkUpdateStatus(recruiterId: string, candidateIds: string[], status: CandidateStatus, note?: string): Promise<CandidateRecord[]> {
    if (candidateIds.length === 0) {
      throw new Error("Select at least one candidate.");
    }

    const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("recruiter_id", recruiterId).in("id", candidateIds);
    if (error) throw new Error(error.message);

    const owned = ((data ?? []) as CandidateRow[]).map(toRecord);

    if (owned.length !== candidateIds.length) {
      throw new CandidateNotFoundError();
    }

    const invalidTransition = owned.find((record) => !isValidStatusTransition(record.status, status));
    if (invalidTransition) {
      throw new Error(`Cannot move a candidate from "${invalidTransition.status}" to "${status}".`);
    }

    const trimmedNote = note?.trim() || null;
    const updated: CandidateRecord[] = [];

    for (const record of owned) {
      const patch: Record<string, unknown> = {
        status,
        decision_history: [...record.decisionHistory, buildDecisionHistoryEntry(recruiterId, record.status, status, trimmedNote ?? undefined)],
        updated_at: new Date().toISOString(),
      };

      if (trimmedNote) {
        const noteEntry: NoteEntry = { id: randomUUID(), category: "Recruiter", text: trimmedNote, createdAt: new Date().toISOString() };
        patch.notes = [...record.notes, noteEntry];
      }

      const { data: row, error: updateError } = await supabaseAdmin
        .from(TABLE)
        .update(patch)
        .eq("id", record.candidateId)
        .eq("recruiter_id", recruiterId)
        .select("*")
        .single();

      if (updateError) throw new Error(updateError.message);
      updated.push(toRecord(row as CandidateRow));
    }

    console.log(`${LOG_PREFIX} Bulk Status Update`, { count: candidateIds.length, status });

    return updated;
  }

  async updateTags(candidateId: string, recruiterId: string, tags: CandidateTag[]): Promise<CandidateRecord> {
    const allowed = new Set<string>(CANDIDATE_TAGS);
    return this.update(candidateId, recruiterId, { tags: tags.filter((tag) => allowed.has(tag)) });
  }

  async addNote(candidateId: string, recruiterId: string, category: NoteCategory, text: string): Promise<CandidateRecord> {
    const record = await this.requireRecord(candidateId, recruiterId);
    const note: NoteEntry = { id: randomUUID(), category, text, createdAt: new Date().toISOString() };
    return this.update(candidateId, recruiterId, { notes: [...record.notes, note] });
  }

  async updateRecruiterFields(candidateId: string, recruiterId: string, fields: { noticePeriod?: string | null; expectedSalary?: string | null }): Promise<CandidateRecord> {
    const patch: Record<string, unknown> = {};
    if (fields.noticePeriod !== undefined) patch.notice_period = fields.noticePeriod;
    if (fields.expectedSalary !== undefined) patch.expected_salary = fields.expectedSalary;
    return this.update(candidateId, recruiterId, patch);
  }

  async remove(candidateId: string, recruiterId: string): Promise<void> {
    await this.requireRecord(candidateId, recruiterId); // ownership check

    const { error } = await supabaseAdmin.from(TABLE).delete().eq("id", candidateId).eq("recruiter_id", recruiterId);
    if (error) throw new Error(error.message);

    ephemeralPointers.delete(candidateId);
  }

  // -------------------------------------------------------------------
  // AI generation
  // -------------------------------------------------------------------

  async generateInsights(candidateId: string, recruiterId: string): Promise<CandidateRecord> {
    const record = await this.requireRecord(candidateId, recruiterId);
    const insights = await generateCandidateInsights(record.resumeData, record.jdMatchResult);

    console.log(`${LOG_PREFIX} Insights Generated`, { candidateId });

    return this.update(candidateId, recruiterId, { insights });
  }

  /** On-demand only (design decision 4, unchanged) — never run automatically at import time. See the ephemeralPointers doc comment for why this remains bound to prepService's original ephemeral window. */
  async generateInterviewReadiness(candidateId: string, recruiterId: string): Promise<CandidateRecord> {
    await this.requireRecord(candidateId, recruiterId); // ownership check
    this.purgeExpiredPointers();

    const pointers = ephemeralPointers.get(candidateId);

    if (!pointers?.jdMatchId) {
      throw new Error("Match this candidate against a job first — interview readiness needs a JD match.");
    }

    const prepRecord = await prepService.generate({ resumeId: pointers.resumeId, jdMatchId: pointers.jdMatchId });

    console.log(`${LOG_PREFIX} Interview Readiness Generated`, { candidateId });

    return this.update(candidateId, recruiterId, { interview_readiness_score: prepRecord.report.readinessScore.overall });
  }

  // -------------------------------------------------------------------
  // Dashboard / ranking / comparison / recommendations
  // -------------------------------------------------------------------

  async computeDashboard(recruiterId: string): Promise<DashboardSummary> {
    const [summaries, jobs] = await Promise.all([this.list(recruiterId), recruiterJobService.listJobs(recruiterId)]);

    const skillCounts = new Map<string, number>();
    const techCounts = new Map<string, number>();

    // Skill/tech distribution reads full resume snapshots, not just
    // summaries — one extra scoped query rather than re-fetching per
    // candidate (no N+1).
    const { data, error } = await supabaseAdmin.from(TABLE).select("resume_data").eq("recruiter_id", recruiterId);
    if (error) throw new Error(error.message);

    for (const row of (data ?? []) as { resume_data: CandidateRow["resume_data"] }[]) {
      row.resume_data.skills.forEach((skill) => bumpCount(skillCounts, skill));
      row.resume_data.technicalSkills.forEach((tech) => bumpCount(techCounts, tech));
    }

    const statusCount = (status: CandidateStatus) => summaries.filter((candidate) => candidate.status === status).length;

    const average = (values: (number | null)[]): number | null => {
      const present = values.filter((value): value is number => value !== null);
      return present.length > 0 ? Math.round(present.reduce((sum, value) => sum + value, 0) / present.length) : null;
    };

    const skillDistribution = [...skillCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([skill, count]) => ({ skill, count }));

    const topTechnologies = [...techCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([technology, count]) => ({ technology, count }));

    const recentUploads = [...summaries].sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, 5);

    return {
      totalCandidates: summaries.length,
      shortlisted: statusCount("Shortlisted"),
      interviewScheduled: statusCount("Interview Scheduled"),
      rejected: statusCount("Rejected"),
      pendingReview: statusCount("Pending Review"),
      averageAtsScore: average(summaries.map((candidate) => candidate.scores.atsScore)),
      averageJdMatch: average(summaries.map((candidate) => candidate.scores.jdMatch)),
      averageExperience: average(summaries.map((candidate) => candidate.experienceYears)),
      skillDistribution,
      topTechnologies,
      recentUploads,
      jobCount: jobs.length,
    };
  }

  /** options.jobId narrows ranking to one job's candidates — same rankCandidates() engine (Milestone 1, unmodified), just fed a job-scoped input list. Used by Milestone 6's "Top Candidates" analytics. */
  async computeRanking(recruiterId: string, options: { jobId?: string } = {}): Promise<RankedCandidate[]> {
    const ranked = rankCandidates(await this.list(recruiterId, options));

    console.log(`${LOG_PREFIX} Candidate Ranked`, { count: ranked.length });

    return ranked;
  }

  /**
   * Phase 16 Milestone 6, §4 — the one genuinely new query this
   * milestone needs: skill-gap aggregation reads jd_match_result.missingSkills
   * across a job's candidates, a field CandidateSummary deliberately
   * omits (Milestone 4, §21 — the list view avoids full snapshots).
   * Selects only `id` and `jd_match_result`, never `resume_data` — no
   * heavier than list() needs to be for this one purpose, and still a
   * single recruiter-scoped query, not one per candidate.
   */
  async listMissingSkills(recruiterId: string, jobId?: string): Promise<{ candidateId: string; missingSkills: string[] }[]> {
    let query = supabaseAdmin.from(TABLE).select("id, jd_match_result").eq("recruiter_id", recruiterId);
    if (jobId) query = query.eq("job_id", jobId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return ((data ?? []) as { id: string; jd_match_result: JdMatchResult | null }[]).map((row) => ({
      candidateId: row.id,
      missingSkills: row.jd_match_result?.missingSkills ?? [],
    }));
  }

  /**
   * Phase 16 Milestone 9, §1 — a sibling lightweight lookup to
   * listMissingSkills() above (same "select id + jd_match_result,
   * scoped to recruiter/job" shape), extracting the additional
   * per-candidate JD-match fields the candidate EXPORT needs
   * (matchedSkills for "Skills Match", educationScore/certificationScore
   * for "Education Match"/"Certification Match") that CandidateSummary
   * deliberately omits. Kept separate from listMissingSkills() rather
   * than widening its return shape, since that method is already used
   * (and tested) by Milestone 6's skill-gap analytics for its one
   * original purpose. Never a second scoring engine — every field here
   * is read directly off the JD matcher's own already-computed output.
   */
  async listCandidateMatchDetails(
    recruiterId: string,
    jobId?: string
  ): Promise<{ candidateId: string; matchedSkills: string[]; missingSkills: string[]; educationScore: number | null; certificationScore: number | null }[]> {
    let query = supabaseAdmin.from(TABLE).select("id, jd_match_result").eq("recruiter_id", recruiterId);
    if (jobId) query = query.eq("job_id", jobId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return ((data ?? []) as { id: string; jd_match_result: JdMatchResult | null }[]).map((row) => ({
      candidateId: row.id,
      matchedSkills: row.jd_match_result?.matchedSkills ?? [],
      missingSkills: row.jd_match_result?.missingSkills ?? [],
      educationScore: row.jd_match_result?.educationScore ?? null,
      certificationScore: row.jd_match_result?.certificationScore ?? null,
    }));
  }

  /**
   * Phase 16 Milestone 8, §9 — the one genuinely new query the
   * interview funnel analytics need: decision_history per candidate,
   * a field CandidateSummary deliberately omits (same reasoning as
   * listMissingSkills() above). Selects only `id, decision_history` —
   * a single recruiter-scoped query, not one per candidate.
   */
  async listDecisionHistories(recruiterId: string, jobId?: string): Promise<{ candidateId: string; decisionHistory: DecisionHistoryEntry[] }[]> {
    let query = supabaseAdmin.from(TABLE).select("id, decision_history").eq("recruiter_id", recruiterId);
    if (jobId) query = query.eq("job_id", jobId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return ((data ?? []) as { id: string; decision_history: DecisionHistoryEntry[] }[]).map((row) => ({
      candidateId: row.id,
      decisionHistory: row.decision_history ?? [],
    }));
  }

  /**
   * Phase 16 Milestone 8, §10 — the safe adapter for "Open Interview
   * Preparation" / "Start Mock Interview" links from a candidate's
   * profile. Ownership-checked, then reads the SAME process-local
   * ephemeralPointers compatibility map generateInterviewReadiness()
   * already relies on (Milestone 3) — never accepts a client-supplied
   * jobId or resumeId/jdMatchId; both are always derived from this
   * candidate's own prior match against their OWN attached job. Returns
   * null (never a fabricated id) once the ~2h ephemeral window has
   * elapsed — the caller must show "not available", never invent one.
   */
  async getInterviewLinkParams(candidateId: string, recruiterId: string): Promise<{ resumeId: string; jdMatchId: string } | null> {
    await this.requireRecord(candidateId, recruiterId); // ownership check
    this.purgeExpiredPointers();

    const pointers = ephemeralPointers.get(candidateId);
    if (!pointers?.jdMatchId) return null;

    return { resumeId: pointers.resumeId, jdMatchId: pointers.jdMatchId };
  }

  /**
   * Phase 16 Milestone 5, §17, extracted unchanged in Milestone 9 —
   * ownership + 2-5 count + same-job restriction, shared by both
   * compare() (below, which adds one LLM call for the narrative
   * recommendation) and the new buildComparisonExport() (§7, purely
   * deterministic — never calls the LLM, so exporting a comparison
   * never re-triggers generateComparisonRecommendation).
   */
  private async requireComparableCandidates(recruiterId: string, candidateIds: string[]): Promise<CandidateSummary[]> {
    if (candidateIds.length < 2 || candidateIds.length > 5) {
      throw new Error("Select between 2 and 5 candidates to compare.");
    }

    const records: CandidateRecord[] = [];
    for (const candidateId of candidateIds) {
      records.push(await this.requireRecord(candidateId, recruiterId)); // ownership check — a candidate belonging to another recruiter can never appear in a comparison
    }

    // Every candidate must share the same job (including all being
    // unattached, i.e. jobId null for all) so ATS/JD Match/Candidate
    // Fit mean the same thing across the whole comparison.
    const jobIds = new Set(records.map((record) => record.jobId));
    if (jobIds.size > 1) {
      throw new Error("Candidates must belong to the same job to compare.");
    }

    return records.map((record) => toSummary(record));
  }

  async compare(recruiterId: string, candidateIds: string[]): Promise<ComparisonResult> {
    const summaries = await this.requireComparableCandidates(recruiterId, candidateIds);

    const table = buildComparisonTable(summaries);
    const { recommendation, rankingRationale, perCandidateNotes } = await generateComparisonRecommendation(summaries, table);

    console.log(`${LOG_PREFIX} Comparison Generated`, { candidateIds });

    return {
      candidateIds,
      candidates: summaries,
      table,
      recommendation,
      rankingRationale,
      perCandidateNotes: perCandidateNotes.map((note) => ({ candidateId: note.candidateId, keyDifferentiators: note.keyDifferentiators })),
    };
  }

  /**
   * Phase 16 Milestone 9, §7 — the export path for an already-run
   * comparison. Deliberately does NOT call generateComparisonRecommendation()
   * (compare()'s one LLM call) — an export is a deterministic rendering
   * of the same table/candidates compare() already computes without AI,
   * so exporting never introduces (or re-triggers) an LLM call.
   */
  async buildComparisonExport(recruiterId: string, candidateIds: string[]): Promise<{ candidates: CandidateSummary[]; table: ComparisonRow[] }> {
    const summaries = await this.requireComparableCandidates(recruiterId, candidateIds);
    return { candidates: summaries, table: buildComparisonTable(summaries) };
  }

  async recommendTopCandidates(recruiterId: string, topN = 5): Promise<TopCandidatesRecommendation> {
    const ranked = await this.computeRanking(recruiterId);
    return generateTopCandidatesRecommendation(ranked, topN);
  }

  // -------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------

  /**
   * Phase 16 Milestone 9, §1/§2 — the export context every LIST_COLUMNS
   * getter needs beyond a bare CandidateSummary (candidate-export.ts):
   * job title/company, JD-match skill/score detail, and decision
   * history. Three recruiter-scoped queries total, never one per
   * candidate. When `candidateIds` drives the export (§3, "Export
   * Selected" — which may legitimately span multiple jobs), the match-
   * detail/decision-history queries are fetched unscoped by job (still
   * always recruiter_id-scoped) since the export already knows exactly
   * which candidateIds it needs to look up.
   */
  private async buildExportContext(recruiterId: string, jobId?: string): Promise<CandidateExportContext> {
    const [jobs, matchDetails, decisionHistories] = await Promise.all([
      recruiterJobService.listJobs(recruiterId),
      this.listCandidateMatchDetails(recruiterId, jobId),
      this.listDecisionHistories(recruiterId, jobId),
    ]);

    return {
      jobsById: new Map(jobs.map((job) => [job.id, job])),
      matchDetailsByCandidateId: new Map(matchDetails.map((entry) => [entry.candidateId, entry])),
      decisionHistoryByCandidateId: new Map(decisionHistories.map((entry) => [entry.candidateId, entry.decisionHistory])),
    };
  }

  async exportCandidateListCsv(recruiterId: string, options: { jobId?: string; candidateIds?: string[] } = {}): Promise<string> {
    const [summaries, context] = await Promise.all([
      options.candidateIds ? this.listByIds(recruiterId, options.candidateIds) : this.list(recruiterId, { jobId: options.jobId }),
      this.buildExportContext(recruiterId, options.candidateIds ? undefined : options.jobId),
    ]);

    const csv = renderCandidateListCsv(summaries, context);
    console.log(`${LOG_PREFIX} Export Completed`, { format: "csv", selected: Boolean(options.candidateIds) });
    return csv;
  }

  async exportCandidateListExcel(recruiterId: string, options: { jobId?: string; candidateIds?: string[] } = {}): Promise<Buffer> {
    const [summaries, context] = await Promise.all([
      options.candidateIds ? this.listByIds(recruiterId, options.candidateIds) : this.list(recruiterId, { jobId: options.jobId }),
      this.buildExportContext(recruiterId, options.candidateIds ? undefined : options.jobId),
    ]);

    const buffer = await renderCandidateListExcel(summaries, context);
    console.log(`${LOG_PREFIX} Export Completed`, { format: "excel", selected: Boolean(options.candidateIds) });
    return buffer;
  }

  /** Phase 16 Milestone 9, §7 — CSV/XLSX rendering of buildComparisonExport()'s deterministic table; zero LLM calls. */
  async exportComparisonCsv(recruiterId: string, candidateIds: string[]): Promise<string> {
    const { candidates, table } = await this.buildComparisonExport(recruiterId, candidateIds);
    return renderComparisonCsv(candidates, table);
  }

  async exportComparisonExcel(recruiterId: string, candidateIds: string[]): Promise<Buffer> {
    const { candidates, table } = await this.buildComparisonExport(recruiterId, candidateIds);
    return renderComparisonExcel(candidates, table);
  }

  async exportCandidateListPdf(recruiterId: string, jobId?: string): Promise<Buffer> {
    const buffer = await renderCandidateListPdf(await this.list(recruiterId, { jobId }));
    console.log(`${LOG_PREFIX} Export Completed`, { format: "pdf" });
    return buffer;
  }

  async exportCandidateReportPdf(candidateId: string, recruiterId: string): Promise<Buffer> {
    const profile = await this.getProfile(candidateId, recruiterId);

    if (!profile) {
      throw new CandidateNotFoundError();
    }

    return this.renderReport(candidateId, profile);
  }

  /** Unscoped counterpart to exportCandidateReportPdf() — see getForSystemUse()'s doc comment. Internal-only. */
  async exportCandidateReportPdfForSystemUse(candidateId: string): Promise<Buffer> {
    const profile = await this.getProfileForSystemUse(candidateId);

    if (!profile) {
      throw new CandidateNotFoundError();
    }

    return this.renderReport(candidateId, profile);
  }

  private async renderReport(candidateId: string, profile: CandidateProfile): Promise<Buffer> {
    const buffer = await renderCandidateReportPdf(profile);
    console.log(`${LOG_PREFIX} Export Completed`, { format: "candidate-report", candidateId });
    return buffer;
  }
}

export const candidateService = new CandidateService();

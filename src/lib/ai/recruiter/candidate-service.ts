import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { jdMatchService } from "../job-description/jd-service";
import { prepService } from "../interview-prep/prep-service";
import { resumeService } from "../resume/resume-service";

import { buildComparisonTable, generateComparisonRecommendation } from "./candidate-comparison";
import { renderCandidateListCsv, renderCandidateListExcel, renderCandidateListPdf, renderCandidateReportPdf } from "./candidate-export";
import { generateCandidateInsights } from "./candidate-insights";
import { rankCandidates } from "./candidate-ranking";
import { generateTopCandidatesRecommendation } from "./candidate-recommendation";
import { CANDIDATE_TAGS, CandidateStatus, CandidateTag, NoteCategory, NoteEntry } from "./candidate-schema";
import { computeScoreBreakdown } from "./candidate-score";
import { suggestTags } from "./candidate-tags";
import {
  CandidateImportFile,
  CandidateImportResult,
  CandidateProfile,
  CandidateRecord,
  CandidateSummary,
  ComparisonResult,
  DashboardSummary,
  RankedCandidate,
  TopCandidatesRecommendation,
} from "./candidate-types";

const LOG_PREFIX = "[recruiter]";

// Recruiter chat has no per-record ID to key on — the workspace is a
// true singleton (design decision 8), so this context carries a
// boolean flag rather than an ID, unlike every other request-scoped
// context in this arc.
export const recruiterRequestContext = new AsyncLocalStorage<{ active: true }>();

function bumpCount(map: Map<string, number>, rawKey: string): void {
  const key = rawKey.trim();
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

export class CandidateService {
  private readonly records = new Map<string, CandidateRecord>();
  private activeJobDescriptionText: string | null = null;

  // -------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------

  // No independent TTL/timer (design decision 2) — a candidate is
  // purged exactly when its underlying resume has already expired via
  // resumeService's own 2h TTL, never on a separate schedule.
  private purgeExpired(): void {
    for (const [id, record] of this.records) {
      if (!resumeService.get(record.resumeId)) {
        this.records.delete(id);
      }
    }
  }

  private toSummary(record: CandidateRecord): CandidateSummary | null {
    const resumeRecord = resumeService.get(record.resumeId);
    if (!resumeRecord) return null;

    const { resume, atsScore } = resumeRecord;
    const jdMatchRecord = record.jdMatchId ? jdMatchService.get(record.jdMatchId) : undefined;
    const jdMatch = jdMatchRecord?.matchResult ?? null;
    const prepRecord = record.prepId ? prepService.get(record.prepId) : undefined;
    const interviewReadiness = prepRecord?.report.readinessScore.overall ?? null;

    const scores = computeScoreBreakdown({ resume, resumeAtsScore: atsScore, jdMatch, interviewReadiness });
    const currentJob = resume.workExperience.find((job) => job.isCurrent) ?? resume.workExperience[0];

    return {
      candidateId: record.candidateId,
      name: resume.contact.name ?? resumeRecord.filename,
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
    };
  }

  private requireRecord(candidateId: string): CandidateRecord {
    this.purgeExpired();

    const record = this.records.get(candidateId);

    if (!record) {
      throw new Error("Candidate not found, or their resume has expired — re-import to continue.");
    }

    return record;
  }

  private touch(record: CandidateRecord): CandidateRecord {
    record.updatedAt = new Date().toISOString();
    return record;
  }

  // -------------------------------------------------------------------
  // Import & JD matching
  // -------------------------------------------------------------------

  async importResumes(files: CandidateImportFile[]): Promise<CandidateImportResult> {
    const imported: CandidateSummary[] = [];
    const failed: { filename: string; error: string }[] = [];

    for (const file of files) {
      try {
        const resumeRecord = await resumeService.analyzeUpload(file);
        const candidateId = randomUUID();
        const now = new Date().toISOString();

        const record: CandidateRecord = {
          candidateId,
          resumeId: resumeRecord.resumeId,
          jdMatchId: null,
          prepId: null,
          status: "Pending Review",
          tags: suggestTags(resumeRecord.resume),
          notes: [],
          noticePeriod: null,
          expectedSalary: null,
          insights: null,
          rankingScore: null,
          importedAt: now,
          updatedAt: now,
        };

        this.records.set(candidateId, record);

        console.log(`${LOG_PREFIX} Candidate Imported`, { candidateId, filename: file.filename });

        if (this.activeJobDescriptionText) {
          try {
            await this.matchCandidateToActiveJd(candidateId);
          } catch (matchError) {
            console.error(`${LOG_PREFIX} Auto-match against active JD failed`, {
              candidateId,
              error: matchError instanceof Error ? matchError.message : matchError,
            });
          }
        }

        const summary = this.toSummary(record);
        if (summary) imported.push(summary);
      } catch (error) {
        failed.push({ filename: file.filename, error: error instanceof Error ? error.message : "Import failed" });
      }
    }

    return { imported, failed };
  }

  async setJobDescription(text: string): Promise<{ matched: number; failed: number }> {
    this.activeJobDescriptionText = text;
    this.purgeExpired();

    let matched = 0;
    let failed = 0;

    for (const record of this.records.values()) {
      if (record.jdMatchId) continue;

      try {
        await this.matchCandidateToActiveJd(record.candidateId);
        matched++;
      } catch {
        failed++;
      }
    }

    return { matched, failed };
  }

  async matchCandidateToActiveJd(candidateId: string): Promise<CandidateRecord> {
    if (!this.activeJobDescriptionText) {
      throw new Error("No active job description has been set for this workspace yet.");
    }

    const record = this.requireRecord(candidateId);

    const jdMatchRecord = await jdMatchService.analyze({
      resumeId: record.resumeId,
      jd: { text: this.activeJobDescriptionText },
    });

    record.jdMatchId = jdMatchRecord.jdMatchId;

    return this.touch(record);
  }

  getActiveJobDescription(): string | null {
    return this.activeJobDescriptionText;
  }

  // -------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------

  list(): CandidateSummary[] {
    this.purgeExpired();

    const summaries: CandidateSummary[] = [];

    for (const record of this.records.values()) {
      const summary = this.toSummary(record);
      if (summary) summaries.push(summary);
    }

    return summaries;
  }

  get(candidateId: string): CandidateRecord | undefined {
    this.purgeExpired();

    return this.records.get(candidateId);
  }

  getProfile(candidateId: string): CandidateProfile | undefined {
    const record = this.get(candidateId);
    if (!record) return undefined;

    const resumeRecord = resumeService.get(record.resumeId);
    if (!resumeRecord) return undefined;

    const summary = this.toSummary(record);
    if (!summary) return undefined;

    const jdMatchRecord = record.jdMatchId ? jdMatchService.get(record.jdMatchId) : undefined;

    return {
      summary,
      record,
      resume: resumeRecord.resume,
      jdMatchResult: jdMatchRecord?.matchResult ?? null,
    };
  }

  /** Used by resume.tool.ts's "compare X and Y" chat command. */
  findByNameFragment(fragment: string): CandidateSummary[] {
    const lower = fragment.toLowerCase();
    return this.list().filter((candidate) => candidate.name.toLowerCase().includes(lower));
  }

  /** Used by resume.tool.ts's "who has X experience" chat command — checks real skill lists, not just the fixed tag palette. */
  searchBySkill(term: string): CandidateSummary[] {
    this.purgeExpired();

    const lower = term.toLowerCase();
    const results: CandidateSummary[] = [];

    for (const record of this.records.values()) {
      const resumeRecord = resumeService.get(record.resumeId);
      if (!resumeRecord) continue;

      const corpus = [...resumeRecord.resume.skills, ...resumeRecord.resume.technicalSkills].join(" ").toLowerCase();

      if (corpus.includes(lower)) {
        const summary = this.toSummary(record);
        if (summary) results.push(summary);
      }
    }

    return results;
  }

  /** Used by resume.tool.ts's "who is ready for interview" chat command. */
  findReadyForInterview(threshold = 60): CandidateSummary[] {
    return this.list().filter((candidate) => candidate.scores.interviewReadiness !== null && candidate.scores.interviewReadiness >= threshold);
  }

  // -------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------

  updateStatus(candidateId: string, status: CandidateStatus): CandidateRecord {
    const record = this.requireRecord(candidateId);
    record.status = status;
    return this.touch(record);
  }

  updateTags(candidateId: string, tags: CandidateTag[]): CandidateRecord {
    const record = this.requireRecord(candidateId);
    const allowed = new Set<string>(CANDIDATE_TAGS);
    record.tags = tags.filter((tag) => allowed.has(tag));
    return this.touch(record);
  }

  addNote(candidateId: string, category: NoteCategory, text: string): CandidateRecord {
    const record = this.requireRecord(candidateId);
    const note: NoteEntry = { id: randomUUID(), category, text, createdAt: new Date().toISOString() };
    record.notes = [...record.notes, note];
    return this.touch(record);
  }

  updateRecruiterFields(candidateId: string, fields: { noticePeriod?: string | null; expectedSalary?: string | null }): CandidateRecord {
    const record = this.requireRecord(candidateId);
    if (fields.noticePeriod !== undefined) record.noticePeriod = fields.noticePeriod;
    if (fields.expectedSalary !== undefined) record.expectedSalary = fields.expectedSalary;
    return this.touch(record);
  }

  remove(candidateId: string): void {
    this.records.delete(candidateId);
  }

  // -------------------------------------------------------------------
  // AI generation
  // -------------------------------------------------------------------

  async generateInsights(candidateId: string): Promise<CandidateRecord> {
    const record = this.requireRecord(candidateId);
    const resumeRecord = resumeService.get(record.resumeId);

    if (!resumeRecord) {
      throw new Error("Resume no longer available for this candidate.");
    }

    const jdMatchRecord = record.jdMatchId ? jdMatchService.get(record.jdMatchId) : undefined;
    const insights = await generateCandidateInsights(resumeRecord.resume, jdMatchRecord?.matchResult ?? null);

    record.insights = insights;
    this.touch(record);

    console.log(`${LOG_PREFIX} Insights Generated`, { candidateId });

    return record;
  }

  /** On-demand only (design decision 4) — never run automatically at import time. */
  async generateInterviewReadiness(candidateId: string): Promise<CandidateRecord> {
    const record = this.requireRecord(candidateId);

    if (!record.jdMatchId) {
      throw new Error("Match this candidate against the job description first — interview readiness needs a JD match.");
    }

    const prepRecord = await prepService.generate({ resumeId: record.resumeId, jdMatchId: record.jdMatchId });
    record.prepId = prepRecord.prepId;

    return this.touch(record);
  }

  // -------------------------------------------------------------------
  // Dashboard / ranking / comparison / recommendations
  // -------------------------------------------------------------------

  computeDashboard(): DashboardSummary {
    this.purgeExpired();

    const summaries: CandidateSummary[] = [];
    const skillCounts = new Map<string, number>();
    const techCounts = new Map<string, number>();

    for (const record of this.records.values()) {
      const resumeRecord = resumeService.get(record.resumeId);
      if (!resumeRecord) continue;

      const summary = this.toSummary(record);
      if (!summary) continue;
      summaries.push(summary);

      resumeRecord.resume.skills.forEach((skill) => bumpCount(skillCounts, skill));
      resumeRecord.resume.technicalSkills.forEach((tech) => bumpCount(techCounts, tech));
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
      activeJobDescriptionSet: this.activeJobDescriptionText !== null,
    };
  }

  computeRanking(): RankedCandidate[] {
    const ranked = rankCandidates(this.list());

    ranked.forEach((item) => {
      const record = this.records.get(item.candidateId);
      if (record) record.rankingScore = item.rankingScore;
    });

    console.log(`${LOG_PREFIX} Candidate Ranked`, { count: ranked.length });

    return ranked;
  }

  async compare(candidateIds: string[]): Promise<ComparisonResult> {
    if (candidateIds.length < 2 || candidateIds.length > 5) {
      throw new Error("Select between 2 and 5 candidates to compare.");
    }

    const summaries = candidateIds.map((candidateId) => {
      this.requireRecord(candidateId);
      const record = this.records.get(candidateId)!;
      const summary = this.toSummary(record);

      if (!summary) {
        throw new Error("One of the selected candidates is no longer available.");
      }

      return summary;
    });

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

  async recommendTopCandidates(topN = 5): Promise<TopCandidatesRecommendation> {
    const ranked = this.computeRanking();
    return generateTopCandidatesRecommendation(ranked, topN);
  }

  // -------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------

  exportCandidateListCsv(): string {
    const csv = renderCandidateListCsv(this.list());
    console.log(`${LOG_PREFIX} Export Completed`, { format: "csv" });
    return csv;
  }

  async exportCandidateListExcel(): Promise<Buffer> {
    const buffer = await renderCandidateListExcel(this.list());
    console.log(`${LOG_PREFIX} Export Completed`, { format: "excel" });
    return buffer;
  }

  async exportCandidateListPdf(): Promise<Buffer> {
    const buffer = await renderCandidateListPdf(this.list());
    console.log(`${LOG_PREFIX} Export Completed`, { format: "pdf" });
    return buffer;
  }

  async exportCandidateReportPdf(candidateId: string): Promise<Buffer> {
    const profile = this.getProfile(candidateId);

    if (!profile) {
      throw new Error("Candidate not found or their resume has expired.");
    }

    const buffer = await renderCandidateReportPdf(profile);
    console.log(`${LOG_PREFIX} Export Completed`, { format: "candidate-report", candidateId });
    return buffer;
  }
}

export const candidateService = new CandidateService();

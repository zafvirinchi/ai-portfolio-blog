import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { extractResumeText, parseResumeText } from "./resume-parser";
import { resumeAnalyzer } from "./resume-analyzer";
import { resumeScorer } from "./resume-score";
import { resumeSuggestionsEngine } from "./resume-suggestions";
import { AtsScore, CAREER_LEVELS, Resume, ResumeAnalysis, SkillGap } from "./resume-schema";
import { ResumeAnalysisResult, ResumeRecord, ResumeUploadInput } from "./resume-types";

const RESUME_LOG_PREFIX = "[resume-agent]";

// Uploaded resumes are temporary and intentionally NOT written to
// rag_documents / rag_document_chunks (the Knowledge Base) — they live only
// in this process-memory store, per the Phase 9 spec. A resumeId expires
// after RESUME_TTL_MS so this doesn't grow unbounded; there is no
// persistence layer yet (see PHASE9 docs, "Future persistent storage").
const RESUME_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StoredResumeRecord {
  record: ResumeRecord;
  expiresAt: number;
}

/**
 * Phase 17 Milestone 2 — seedFromResumeVersion()'s only real gap: a
 * Dynamic Resume Version doesn't carry resumeAnalyzer.analyze()'s
 * LLM-generated ResumeAnalysis (career level, suitable roles, etc.), and
 * seeding one via a fresh LLM call would violate this milestone's own
 * "no additional LLM call merely to resolve the Resume Version" rule.
 * prepService.generate() never reads `.analysis` at all (confirmed by
 * inspection) — this exists purely to satisfy ResumeRecord's existing
 * type contract, so it is built entirely from REAL resume facts via a
 * deterministic, documented fallback (never an LLM guess), the same
 * discipline candidate-score.ts's own fallback heuristics already use.
 * Never surfaced to a user.
 */
function deriveFallbackCareerLevel(yearsOfExperience: number | null): (typeof CAREER_LEVELS)[number] {
  const years = yearsOfExperience ?? 0;
  if (years >= 12) return "principal";
  if (years >= 8) return "lead";
  if (years >= 4) return "senior";
  if (years >= 1) return "mid-level";
  return "entry-level";
}

function buildFallbackAnalysis(resume: Resume): ResumeAnalysis {
  return {
    professionalSummary: resume.summary || "",
    keyStrengths: [],
    weaknesses: [],
    missingSkills: [],
    careerLevel: deriveFallbackCareerLevel(resume.yearsOfExperience),
    suitableRoles: [],
    technologyStack: [...resume.technicalSkills],
    improvementSuggestions: [],
  };
}

// Request-scoped context so resume-tool.ts can find "which resume is this
// chat question about" without threading a resumeId through GraphState,
// Agent.run(), or ConversationService.ask() — none of which change in this
// phase. Set by API routes (see /api/ai/chat) via `.run()`.
export const resumeRequestContext = new AsyncLocalStorage<{ resumeId: string }>();

export class ResumeService {
  private readonly records = new Map<string, StoredResumeRecord>();

  private purgeExpired(): void {
    const now = Date.now();

    for (const [id, entry] of this.records) {
      if (entry.expiresAt <= now) {
        this.records.delete(id);
      }
    }
  }

  /**
   * Runs the full Upload -> Extract -> Parse -> Analyze -> Score -> Suggest
   * pipeline for one uploaded resume file and stores the result in memory.
   */
  async analyzeUpload(input: ResumeUploadInput): Promise<ResumeAnalysisResult> {
    const startedAt = Date.now();

    console.log(`${RESUME_LOG_PREFIX} Resume uploaded`, { filename: input.filename });

    const rawText = await extractResumeText(input);
    const resume = await parseResumeText(rawText);

    console.log(`${RESUME_LOG_PREFIX} Resume parsed`, {
      filename: input.filename,
      skillCount: resume.skills.length,
      workExperienceCount: resume.workExperience.length,
    });

    const [analysis, atsScore] = await Promise.all([
      resumeAnalyzer.analyze(resume),
      Promise.resolve(resumeScorer.score(resume)),
    ]);

    console.log(`${RESUME_LOG_PREFIX} Analysis completed`, {
      filename: input.filename,
      careerLevel: analysis.careerLevel,
    });

    console.log(`${RESUME_LOG_PREFIX} ATS generated`, {
      filename: input.filename,
      overall: atsScore.overall,
    });

    const skillGap = resumeSuggestionsEngine.analyzeSkillGap(resume);

    const resumeId = randomUUID();

    const result: ResumeAnalysisResult = {
      resumeId,
      filename: input.filename,
      uploadedAt: new Date().toISOString(),
      resume,
      analysis,
      atsScore,
      skillGap,
      processingTimeMs: Date.now() - startedAt,
    };

    this.purgeExpired();
    this.records.set(resumeId, { record: result, expiresAt: Date.now() + RESUME_TTL_MS });

    return result;
  }

  get(resumeId: string): ResumeRecord | undefined {
    this.purgeExpired();

    return this.records.get(resumeId)?.record;
  }

  /**
   * Phase 17 Milestone 2 — the Dynamic Resume Version adapter's entry
   * point into this store. Seeds a new ephemeral record from an
   * already-known Resume (a persisted resume_versions row's resumeData,
   * already ownership-checked by the caller — see interview-prep/
   * resume-version-adapter.ts) WITHOUT re-running the upload -> extract
   * -> parse -> analyze pipeline analyzeUpload() runs — no new LLM call.
   * `atsScore`/`skillGap` are supplied by the caller (both deterministic,
   * cheap to recompute fresh — resumeScorer.score()/
   * resumeSuggestionsEngine.analyzeSkillGap(), the exact same functions
   * resume-version-service.ts itself already calls); see
   * buildFallbackAnalysis() above for why `analysis` is a documented
   * fallback rather than a real analysis.
   */
  seedFromResumeVersion(resume: Resume, atsScore: AtsScore, skillGap: SkillGap): ResumeRecord {
    const resumeId = randomUUID();

    const record: ResumeRecord = {
      resumeId,
      filename: resume.contact.name ? `${resume.contact.name}'s Resume` : "Resume Version",
      uploadedAt: new Date().toISOString(),
      resume,
      analysis: buildFallbackAnalysis(resume),
      atsScore,
      skillGap,
      processingTimeMs: 0,
    };

    this.purgeExpired();
    this.records.set(resumeId, { record, expiresAt: Date.now() + RESUME_TTL_MS });

    return record;
  }
}

export const resumeService = new ResumeService();

import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { extractResumeText, parseResumeText } from "./resume-parser";
import { resumeAnalyzer } from "./resume-analyzer";
import { resumeScorer } from "./resume-score";
import { resumeSuggestionsEngine } from "./resume-suggestions";
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
}

export const resumeService = new ResumeService();

import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { jdMatchService } from "../job-description/jd-service";
import { resumeService } from "../resume/resume-service";
import { generateIdealAnswer } from "./answer-generator";
import { buildLearningRoadmap } from "./learning-roadmap";
import { InterviewPreparationReport, interviewPreparationReportSchema } from "./prep-schema";
import { PrepGenerateInput, PrepRecord } from "./prep-types";
import { coverTechnicalTopicsFromKb, deriveTechnicalTopics, generateQuestionsAndAnswers, recommendCodingTopics } from "./question-generator";
import { buildCheatSheet, computeReadinessScore } from "./study-plan";
import { analyzeConfidence, analyzeWeaknesses } from "./weakness-analyzer";

const LOG_PREFIX = "[interview-prep]";
const PREP_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — same pattern every in-memory store in this codebase uses

interface StoredPrepRecord {
  record: PrepRecord;
  expiresAt: number;
}

// Request-scoped context, same AsyncLocalStorage pattern as
// resumeRequestContext/jdMatchRequestContext — a new, independent
// instance defined here directly (mirrors jd-service.ts embedding
// jdMatchRequestContext itself rather than a separate file).
export const interviewPrepRequestContext = new AsyncLocalStorage<{ prepId: string }>();

export class PrepService {
  private readonly records = new Map<string, StoredPrepRecord>();

  private purgeExpired(): void {
    const now = Date.now();

    for (const [id, entry] of this.records) {
      if (entry.expiresAt <= now) {
        this.records.delete(id);
      }
    }
  }

  async generate(input: PrepGenerateInput): Promise<PrepRecord> {
    console.log(`${LOG_PREFIX} Preparation Started`);

    const resumeRecord = resumeService.get(input.resumeId);

    if (!resumeRecord) {
      throw new Error("Resume not found or expired — please re-upload your resume.");
    }

    const jdMatchRecord = jdMatchService.get(input.jdMatchId);

    if (!jdMatchRecord) {
      throw new Error("JD match result not found or expired — please re-run the match analysis.");
    }

    const { resume, atsScore, skillGap } = resumeRecord;
    const { jobDescription, matchResult } = jdMatchRecord;

    const topics = deriveTechnicalTopics(jobDescription, resume);
    const { covered, uncoveredTopics } = await coverTechnicalTopicsFromKb(topics);
    const kbCoverageRatio = topics.length === 0 ? 1 : covered.length / topics.length;

    const generated = await generateQuestionsAndAnswers(resume, jobDescription, uncoveredTopics);

    console.log(`${LOG_PREFIX} Questions Generated`, {
      knowledgeBaseTopics: covered.length,
      aiGeneratedTechnical: generated.technicalQuestions.length,
      hr: generated.hrQuestions.length,
      project: generated.projectQuestions.length,
      systemDesign: generated.systemDesignQuestions.length,
    });

    console.log(`${LOG_PREFIX} Answers Generated`, {
      total:
        generated.technicalQuestions.length +
        generated.hrQuestions.length +
        generated.projectQuestions.length +
        generated.systemDesignQuestions.length,
    });

    const codingRecommendations = recommendCodingTopics(jobDescription, resume);
    const weaknessAnalysis = analyzeWeaknesses(matchResult, skillGap);
    const confidenceAnalysis = analyzeConfidence(matchResult);

    const learningRoadmap = buildLearningRoadmap(weaknessAnalysis, skillGap);
    console.log(`${LOG_PREFIX} Roadmap Generated`, { plans: learningRoadmap.length });

    const cheatSheet = buildCheatSheet(resume, jobDescription);
    const readinessScore = computeReadinessScore(resume, atsScore, matchResult, kbCoverageRatio);

    const technicalQuestions = [...covered.flatMap((topic) => topic.kbQuestions), ...generated.technicalQuestions];

    const report: InterviewPreparationReport = interviewPreparationReportSchema.parse({
      readinessScore,
      technicalQuestions,
      hrQuestions: generated.hrQuestions,
      projectQuestions: generated.projectQuestions,
      systemDesignQuestions: generated.systemDesignQuestions,
      codingRecommendations,
      weaknessAnalysis,
      confidenceAnalysis,
      learningRoadmap,
      cheatSheet,
    });

    const prepId = randomUUID();

    const record: PrepRecord = {
      prepId,
      resumeId: input.resumeId,
      jdMatchId: input.jdMatchId,
      report,
      createdAt: new Date().toISOString(),
    };

    this.purgeExpired();
    this.records.set(prepId, { record, expiresAt: Date.now() + PREP_TTL_MS });

    console.log(`${LOG_PREFIX} Preparation Completed`, { prepId });

    return record;
  }

  get(prepId: string): PrepRecord | undefined {
    this.purgeExpired();

    return this.records.get(prepId)?.record;
  }

  /** Backs the on-demand "explain the ideal answer" chat/UI flow — regenerates one answer without re-running the full pipeline. */
  async regenerateAnswer(prepId: string, question: string) {
    const record = this.get(prepId);

    if (!record) {
      throw new Error("Interview preparation report not found or expired.");
    }

    const resumeRecord = resumeService.get(record.resumeId);
    const jdMatchRecord = jdMatchService.get(record.jdMatchId);

    if (!resumeRecord || !jdMatchRecord) {
      throw new Error("Resume or JD match result no longer available for this report.");
    }

    return generateIdealAnswer(question, resumeRecord.resume, jdMatchRecord.jobDescription);
  }
}

export const prepService = new PrepService();

import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { resumeService } from "../resume/resume-service";
import { jdParser } from "./jd-parser";
import { computeJdMatch } from "./jd-matcher";
import { resumeOptimizer } from "./optimizer";
import { jdMatchResultSchema, JdMatchResult } from "./jd-schema";
import { JdMatchAnalyzeInput, JdMatchRecord } from "./jd-types";

const LOG_PREFIX = "[jd]";

// Same in-memory-with-TTL pattern resume/resume-service.ts uses — a fresh,
// independent store (not shared with or modified from that one).
const JD_MATCH_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StoredJdMatchRecord {
  record: JdMatchRecord;
  expiresAt: number;
}

// Request-scoped context, mirroring resumeRequestContext exactly (same
// AsyncLocalStorage pattern, a new independent instance — resume-service.ts
// itself is untouched). Set by /api/ai/chat when a jdMatchId is present, so
// resume.tool.ts can find "which JD match is this chat question about".
export const jdMatchRequestContext = new AsyncLocalStorage<{ jdMatchId: string }>();

export class JdMatchService {
  private readonly records = new Map<string, StoredJdMatchRecord>();

  private purgeExpired(): void {
    const now = Date.now();

    for (const [id, entry] of this.records) {
      if (entry.expiresAt <= now) {
        this.records.delete(id);
      }
    }
  }

  /**
   * Runs Parse JD -> Match (keyword/experience/education/ATS) -> Optimize
   * for one already-uploaded resume (looked up via resumeService.get,
   * read-only) against one job description, and stores the result.
   */
  async analyze(input: JdMatchAnalyzeInput): Promise<JdMatchRecord> {
    const resumeRecord = resumeService.get(input.resumeId);

    if (!resumeRecord) {
      throw new Error("Resume not found or expired — please re-upload your resume.");
    }

    const jobDescription = await jdParser.parse(input.jd);

    console.log(`${LOG_PREFIX} JD Parsed`, {
      jobTitle: jobDescription.jobTitle,
      skillCount: jobDescription.skills.length,
    });

    const computation = computeJdMatch(resumeRecord.resume, jobDescription);

    console.log(`${LOG_PREFIX} Keyword Match`, {
      matched: computation.keywordMatch.matched.length,
      missing: computation.keywordMatch.missing.length,
    });

    console.log(`${LOG_PREFIX} ATS Generated`, { overall: computation.ats.overall });

    const optimized = await resumeOptimizer.optimize(resumeRecord.resume, jobDescription, computation);

    console.log(`${LOG_PREFIX} Optimization Generated`, {
      suggestions: optimized.improvementSuggestions.length,
    });

    const matchResult: JdMatchResult = jdMatchResultSchema.parse({
      overallMatch: computation.overallMatch,
      atsScore: computation.ats.overall,
      keywordScore: computation.ats.keyword,
      experienceScore: computation.ats.experience,
      educationScore: computation.ats.education,
      formattingScore: computation.ats.formatting,
      achievementScore: computation.ats.achievement,
      projectScore: computation.ats.project,
      leadershipScore: computation.ats.leadership,
      certificationScore: computation.ats.certification,
      aiScore: computation.ats.aiSkills,
      cloudScore: computation.ats.cloud,
      securityScore: computation.ats.security,
      softSkillsScore: computation.ats.softSkills,
      matchedSkills: computation.keywordMatch.matched,
      missingSkills: computation.keywordMatch.missing,
      additionalSkills: computation.keywordMatch.additional,
      resumeStrengths: computation.strengths,
      resumeWeaknesses: computation.weaknesses,
      experienceMatch: computation.experienceMatch,
      educationMatch: computation.educationMatch,
      optimizedSummary: optimized.optimizedSummary,
      optimizedExperience: optimized.optimizedExperience,
      optimizedProjects: optimized.optimizedProjects,
      optimizedSkills: optimized.optimizedSkills,
      missingKeywordsSection: optimized.missingSkillsSection,
      missingKeywords: computation.keywordMatch.missing,
      improvementSuggestions: optimized.improvementSuggestions,
    });

    const jdMatchId = randomUUID();

    const record: JdMatchRecord = {
      jdMatchId,
      resumeId: input.resumeId,
      jobDescription,
      matchResult,
      createdAt: new Date().toISOString(),
    };

    this.purgeExpired();
    this.records.set(jdMatchId, { record, expiresAt: Date.now() + JD_MATCH_TTL_MS });

    return record;
  }

  get(jdMatchId: string): JdMatchRecord | undefined {
    this.purgeExpired();

    return this.records.get(jdMatchId)?.record;
  }
}

export const jdMatchService = new JdMatchService();

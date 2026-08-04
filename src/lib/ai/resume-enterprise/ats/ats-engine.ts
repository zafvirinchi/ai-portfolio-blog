import { EnterpriseResume } from "../resume-schema";
import { computeKeywordDensity, computeTechnologyCoverage, detectFormattingIssues } from "./ats-breakdown";
import { buildFeedback, buildInsights, detectAchievements, detectBuzzwords } from "./ats-feedback";
import { AtsReport } from "./ats-schema";
import { computeSectionScores } from "./ats-score";

const LOG_PREFIX = "[ats-engine]";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Deterministic, rule-based ATS scoring engine — no OpenAI calls, no
 * randomness. Same EnterpriseResume in, same AtsReport out, every time.
 * JD matching, resume rewriting, cover letters, and interview questions are
 * explicitly out of scope (future milestones).
 */
export class EnterpriseAtsEngine {
  score(resume: EnterpriseResume): AtsReport {
    const startedAt = Date.now();
    console.log(`${LOG_PREFIX} ATS Started`);

    const sections = computeSectionScores(resume);
    console.log(`${LOG_PREFIX} Section Scores Generated`);

    const formattingIssues = detectFormattingIssues(resume);
    console.log(`${LOG_PREFIX} Formatting Analysis Completed`);

    const technologyCoverage = computeTechnologyCoverage(resume);
    console.log(`${LOG_PREFIX} Technology Analysis Completed`);

    const keywordDensity = computeKeywordDensity(resume);
    console.log(`${LOG_PREFIX} Keyword Analysis Completed`);

    const buzzwords = detectBuzzwords(resume);
    const achievements = detectAchievements(resume);
    const feedback = buildFeedback(resume);
    const insights = buildInsights(sections, feedback);

    // Each section's maxScore is already its weight out of 100 (they sum
    // to 100 — see ats-rules.ts's SECTION_MAX_SCORES), so the raw point sum
    // *is* the weighted composite score.
    const overallScore = clampScore(sections.reduce((sum, section) => sum + section.score, 0));
    const weightedScore = Math.round((overallScore / 100) * 100) / 100;

    const report: AtsReport = {
      overallScore,
      weightedScore,
      sections,
      feedback,
      formattingIssues,
      technologyCoverage,
      keywordDensity,
      buzzwords,
      achievements,
      insights,
      processingTimeMs: Date.now() - startedAt,
    };

    console.log(`${LOG_PREFIX} ATS Completed`, {
      overallScore: report.overallScore,
      processingTimeMs: report.processingTimeMs,
    });

    return report;
  }
}

export const enterpriseAtsEngine = new EnterpriseAtsEngine();

import { EnterpriseResume } from "../resume-schema";
import { AtsFormattingIssue, AtsKeywordDensityEntry, AtsTechnologyCoverageEntry } from "./ats-schema";
import {
  collectAllFreeText,
  collectExperienceText,
  collectProjectTechTokens,
  collectProjectText,
  collectSkillTokens,
  countTechnologyMentions,
  FORMATTING_THRESHOLDS,
  TECHNOLOGY_CATEGORIES,
  TECHNOLOGY_DICTIONARY,
  TECH_MENTION_THRESHOLDS,
  wordCount,
} from "./ats-rules";
import { AtsTechnologyStatus } from "./ats-types";

// Phase 12 Milestone 3. Technology coverage, keyword density, and
// formatting-issue detection — the "breakdown" analyses the engine runs
// between section scoring and feedback generation. Pure functions of
// EnterpriseResume, reused by both ats-score.ts (formatting/skills/keyword
// section scores) and ats-feedback.ts (cloud/AI feedback rules already live
// in ats-rules.ts directly, but buzzword/achievement feedback references
// the same text sources defined here).

function statusForMentionCount(mentions: number): AtsTechnologyStatus {
  const match = TECH_MENTION_THRESHOLDS.find((threshold) => mentions >= threshold.min);
  return match?.status ?? "Missing";
}

/** All searchable text for a resume: skill/technology tokens plus free-text prose. */
function collectSearchableTexts(resume: EnterpriseResume): string[] {
  return [...collectSkillTokens(resume), ...collectProjectTechTokens(resume), ...collectAllFreeText(resume)];
}

export function computeTechnologyCoverage(resume: EnterpriseResume): AtsTechnologyCoverageEntry[] {
  const texts = collectSearchableTexts(resume);

  return TECHNOLOGY_DICTIONARY.map((entry) => {
    const mentions = countTechnologyMentions(texts, entry);

    return {
      name: entry.name,
      category: entry.category,
      mentions,
      status: statusForMentionCount(mentions),
    };
  });
}

export function computeKeywordDensity(resume: EnterpriseResume): AtsKeywordDensityEntry[] {
  const coverage = computeTechnologyCoverage(resume);

  return TECHNOLOGY_CATEGORIES.map((category) => {
    const entriesInCategory = coverage.filter((entry) => entry.category === category);
    const matched = entriesInCategory.filter((entry) => entry.mentions > 0).length;
    const total = entriesInCategory.length;

    return {
      category,
      matched,
      total,
      density: total === 0 ? 0 : Math.round((matched / total) * 100),
    };
  });
}

function normalizeForDedup(value: string): string {
  return value.trim().toLowerCase();
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    const normalized = normalizeForDedup(value);
    if (!normalized) continue;

    if (seen.has(normalized)) {
      duplicates.add(normalized);
    } else {
      seen.add(normalized);
    }
  }

  return Array.from(duplicates);
}

export function detectFormattingIssues(resume: EnterpriseResume): AtsFormattingIssue[] {
  const issues: AtsFormattingIssue[] = [];

  const companyNames = resume.companyHistory.map((c) => c.companyName).filter((v): v is string => Boolean(v));
  if (findDuplicates(companyNames).length > 0) {
    issues.push({
      id: "duplicate-companies",
      message: "Duplicate company entries detected — merge repeated employers into a single entry.",
      severity: "Medium",
    });
  }

  const projectNames = resume.projects.map((p) => p.projectName).filter((v): v is string => Boolean(v));
  if (findDuplicates(projectNames).length > 0) {
    issues.push({
      id: "duplicate-projects",
      message: "Duplicate project entries detected — merge repeated projects into a single entry.",
      severity: "Medium",
    });
  }

  const skillTokens = collectSkillTokens(resume);
  if (findDuplicates(skillTokens).length > 0) {
    issues.push({
      id: "duplicate-technologies",
      message: "The same skill/technology is listed more than once — remove duplicates for a cleaner skills section.",
      severity: "Low",
    });
  }

  const proseTexts = [...collectExperienceText(resume), ...collectProjectText(resume)];
  if (proseTexts.some((text) => text.length > FORMATTING_THRESHOLDS.largeParagraphCharLimit)) {
    issues.push({
      id: "large-paragraphs",
      message: "One or more bullets read as a large paragraph rather than a concise bullet point.",
      severity: "Low",
    });
  }

  const rolesWithoutBullets = resume.companyHistory.filter((company) => company.responsibilities.length === 0);
  if (resume.companyHistory.length > 0 && rolesWithoutBullets.length > 0) {
    issues.push({
      id: "no-bullet-points",
      message: "One or more roles have no bullet points describing responsibilities or achievements.",
      severity: "Medium",
    });
  }

  const totalWords = wordCount(collectAllFreeText(resume));
  if (totalWords > 0 && totalWords < FORMATTING_THRESHOLDS.veryShortResumeWordCount) {
    issues.push({
      id: "very-short-resume",
      message: "Resume content is very short — expand on responsibilities, achievements, and projects.",
      severity: "Medium",
    });
  }

  if (totalWords > FORMATTING_THRESHOLDS.veryLongResumeWordCount) {
    issues.push({
      id: "very-long-resume",
      // Word count is a proxy for length here — the engine only receives
      // structured EnterpriseResume data, not raw page/file layout, so an
      // exact page count isn't available at this stage.
      message: "Resume content is very long and may span more than 2 pages — condense to the most relevant content.",
      severity: "Low",
    });
  }

  return issues;
}

import { EnterpriseResume } from "../resume-schema";
import { computeTechnologyCoverage, detectFormattingIssues } from "./ats-breakdown";
import { AtsSectionScore } from "./ats-schema";
import {
  collectExperienceText,
  collectProjectText,
  countWeakPhraseHits,
  EMAIL_REGEX,
  findAchievementMatches,
  hasAchievementSignal,
  KEYWORD_DENSITY_SCORE_TARGET,
  PHONE_REGEX,
  SECTION_LABELS,
  SECTION_MAX_SCORES,
  SECTION_STATUS_THRESHOLDS,
  skillsContainCategory,
  totalSkillCount,
} from "./ats-rules";
import { ATS_SECTION_KEYS, AtsSectionKey, AtsSectionStatus } from "./ats-types";

// Phase 12 Milestone 3. One deterministic 0-100 percentage scorer per
// section, converted to points (out of that section's SECTION_MAX_SCORES
// weight) by computeSectionScores. No LLM calls, no randomness — same
// resume in, same numbers out, every time.

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percentage(checks: boolean[]): number {
  if (checks.length === 0) return 0;
  return clampPct((checks.filter(Boolean).length / checks.length) * 100);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function scoreContactInformation(resume: EnterpriseResume): number {
  const info = resume.personalInfo;

  return percentage([
    Boolean(info.firstName),
    Boolean(info.lastName),
    Boolean(info.email) && EMAIL_REGEX.test(info.email as string),
    Boolean(info.phone) && PHONE_REGEX.test(info.phone as string),
    Boolean(info.linkedin),
    Boolean(info.github),
    Boolean(info.portfolio),
    Boolean(info.location),
  ]);
}

export function scoreProfessionalSummary(resume: EnterpriseResume): number {
  const { careerObjective, headline, currentDesignation, yearsOfExperience } = resume.professionalSummary;
  const text = (careerObjective ?? headline ?? "").trim();

  let score = 0;
  if (text.length >= 150) score += 70;
  else if (text.length >= 60) score += 50;
  else if (text.length > 0) score += 20;

  if (headline) score += 10;
  if (currentDesignation) score += 10;
  if (yearsOfExperience !== null) score += 10;

  return clampPct(score);
}

export function scoreExperience(resume: EnterpriseResume): number {
  const roles = resume.companyHistory;
  if (roles.length === 0) return 0;

  const experienceText = collectExperienceText(resume);
  const rolesWithBullets = roles.filter((role) => role.responsibilities.length > 0).length;

  let score = 30;
  if (roles.length >= 2) score += 10;
  score += Math.round((rolesWithBullets / roles.length) * 20);
  if (hasAchievementSignal(experienceText)) score += 25;
  if (countWeakPhraseHits(experienceText) === 0) score += 15;

  return clampPct(score);
}

export function scoreEducation(resume: EnterpriseResume): number {
  if (resume.education.length === 0) return 0;

  const perEntryScores = resume.education.map((entry) =>
    percentage([
      Boolean(entry.institute),
      Boolean(entry.degree),
      Boolean(entry.specialization),
      Boolean(entry.startYear || entry.endYear),
      Boolean(entry.grade),
    ])
  );

  return clampPct(average(perEntryScores));
}

export function scoreProjects(resume: EnterpriseResume): number {
  if (resume.projects.length === 0) return 0;

  const withTech = resume.projects.filter((project) => project.technologies.length > 0).length;

  let score = 40;
  score += Math.round((withTech / resume.projects.length) * 30);
  if (hasAchievementSignal(collectProjectText(resume))) score += 30;

  return clampPct(score);
}

export function scoreSkills(resume: EnterpriseResume): number {
  const total = totalSkillCount(resume);
  const categoriesCovered = new Set(
    resume.skills.filter((group) => group.skills.length > 0).map((group) => group.category)
  ).size;

  let score = Math.min(60, total * 5);
  score += Math.min(20, categoriesCovered * 4);
  if (skillsContainCategory(resume, "Cloud")) score += 10;
  if (skillsContainCategory(resume, "AI")) score += 10;

  return clampPct(score);
}

export function scoreFormatting(resume: EnterpriseResume): number {
  const issues = detectFormattingIssues(resume);
  return clampPct(100 - issues.length * 15);
}

export function scoreAchievements(resume: EnterpriseResume): number {
  let score = resume.achievements.length > 0 ? 40 : 0;

  const matches = findAchievementMatches([...collectExperienceText(resume), ...collectProjectText(resume)]);
  const distinctTypes = new Set(matches.map((match) => match.type)).size;
  score += Math.min(60, distinctTypes * 15);

  return clampPct(score);
}

export function scoreCertifications(resume: EnterpriseResume): number {
  const count = resume.certifications.length;

  if (count === 0) return 0;
  if (count === 1) return 50;
  if (count === 2) return 75;

  return 100;
}

export function scoreKeywordDensity(resume: EnterpriseResume): number {
  // Scored against total distinct technology coverage, not an average of
  // computeKeywordDensity's per-category percentages: averaging equally
  // across all 11 categories would force a resume to show Security +
  // Testing + Frontend + Architecture presence just to score well on
  // Keyword Density, even when it's a strong, focused resume in one domain.
  const coverage = computeTechnologyCoverage(resume);
  const distinctMatched = coverage.filter((entry) => entry.mentions > 0).length;

  return clampPct((distinctMatched / KEYWORD_DENSITY_SCORE_TARGET) * 100);
}

const SECTION_SCORERS: Record<AtsSectionKey, (resume: EnterpriseResume) => number> = {
  contactInformation: scoreContactInformation,
  professionalSummary: scoreProfessionalSummary,
  experience: scoreExperience,
  education: scoreEducation,
  projects: scoreProjects,
  skills: scoreSkills,
  formatting: scoreFormatting,
  achievements: scoreAchievements,
  certifications: scoreCertifications,
  keywordDensity: scoreKeywordDensity,
};

function statusForPercentage(percentageValue: number): AtsSectionStatus {
  const match = SECTION_STATUS_THRESHOLDS.find((threshold) => percentageValue >= threshold.min);
  return match?.status ?? "Critical";
}

export function computeSectionScores(resume: EnterpriseResume): AtsSectionScore[] {
  return ATS_SECTION_KEYS.map((key) => {
    const percentageValue = clampPct(SECTION_SCORERS[key](resume));
    const maxScore = SECTION_MAX_SCORES[key];
    const score = Math.round((percentageValue / 100) * maxScore);

    return {
      key,
      label: SECTION_LABELS[key],
      score,
      maxScore,
      percentage: percentageValue,
      status: statusForPercentage(percentageValue),
    };
  });
}

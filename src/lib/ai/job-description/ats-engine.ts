import { ACHIEVEMENT_PATTERNS, TECHNOLOGY_DICTIONARY, WEAK_PHRASES } from "../resume-enterprise/ats";
import { Resume } from "../resume/resume-schema";
import { JobDescription } from "./jd-schema";
import { AtsCategoryScores } from "./jd-types";
import { matchCredit, matchEducationRequirements, matchKeywords } from "./keyword-engine";

// Deterministic, no-LLM ATS scoring across 12 categories, weighted to sum
// to 100. Reuses resume-enterprise/ats's TECHNOLOGY_DICTIONARY/
// WEAK_PHRASES/ACHIEVEMENT_PATTERNS read-only (that package is untouched —
// same cross-package reuse precedent Milestone 5 set) rather than
// rebuilding a third copy of the same reference data, applied here against
// the *old* `Resume` type instead of `EnterpriseResume`.

// Phase 15 Milestone 7 — exported (unchanged values, unchanged scoring
// behavior) for the same reason as resume-score.ts's WEIGHTS — the ATS
// Explainability layer needs the real per-category weights to compute
// an honest impact estimate, never a duplicated/guessed copy.
export const WEIGHTS: Record<Exclude<keyof AtsCategoryScores, "overall">, number> = {
  keyword: 20,
  experience: 15,
  education: 8,
  formatting: 7,
  achievement: 8,
  project: 8,
  leadership: 6,
  certification: 5,
  aiSkills: 5,
  cloud: 6,
  security: 4,
  softSkills: 8,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function jdCombinedSkills(jd: JobDescription): string[] {
  return jd.skills.length > 0 ? jd.skills : [...jd.mandatorySkills, ...jd.goodToHaveSkills];
}

function scoreKeyword(resume: Resume, jd: JobDescription): number {
  const resumeSkills = [...resume.skills, ...resume.technicalSkills];
  const jdSkills = jdCombinedSkills(jd);

  if (jdSkills.length === 0) return 100;

  const result = matchKeywords(resumeSkills, jdSkills);
  return clamp((matchCredit(result) / jdSkills.length) * 100);
}

function scoreEducation(resume: Resume, jd: JobDescription): number {
  if (jd.educationRequired.length === 0) return 100;
  if (resume.education.length === 0) return 0;

  const resumeDegrees = resume.education.map((entry) => entry.degree);
  const result = matchEducationRequirements(resumeDegrees, jd.educationRequired);

  return clamp((matchCredit(result) / jd.educationRequired.length) * 100);
}

// Same formula resume/resume-score.ts's (private, unexported) scoreFormatting
// uses — reimplemented here rather than imported since that function isn't
// exported and resume-score.ts is on the protected "do not modify" list.
function scoreFormatting(resume: Resume): number {
  let score = 0;

  if (resume.contact.name) score += 20;
  if (resume.contact.email) score += 15;
  if (resume.contact.phone) score += 15;
  if (resume.summary && resume.summary.trim().length >= 40) score += 15;

  const jobsWithBullets = resume.workExperience.filter((job) => job.description.length > 0);
  if (resume.workExperience.length > 0 && jobsWithBullets.length === resume.workExperience.length) {
    score += 20;
  } else if (jobsWithBullets.length > 0) {
    score += 10;
  }

  if (resume.education.length > 0) score += 15;

  return clamp(score);
}

function scoreAchievement(resume: Resume): number {
  const texts = [...resume.workExperience.flatMap((job) => job.description), ...resume.achievements];
  if (texts.length === 0) return 0;

  const hasQuantified = texts.some((text) => ACHIEVEMENT_PATTERNS.some((pattern) => pattern.pattern.test(text)));
  const weakHits = texts.reduce(
    (sum, text) =>
      sum + WEAK_PHRASES.reduce((count, weak) => count + (text.toLowerCase().includes(weak.phrase) ? 1 : 0), 0),
    0
  );

  let score = 40;
  if (hasQuantified) score += 40;
  if (weakHits === 0) score += 20;

  return clamp(score);
}

function scoreProject(resume: Resume, jd: JobDescription): number {
  if (resume.projects.length === 0) return 20;

  const withTech = resume.projects.filter((project) => project.technologies.length > 0).length;
  const projectTechTokens = resume.projects.flatMap((project) => project.technologies);
  const jdSkills = jdCombinedSkills(jd);

  let score = 40;
  score += Math.round((withTech / resume.projects.length) * 30);

  if (jdSkills.length > 0) {
    const result = matchKeywords(projectTechTokens, jdSkills);
    score += Math.round((matchCredit(result) / jdSkills.length) * 30);
  } else {
    score += 30;
  }

  return clamp(score);
}

const LEADERSHIP_KEYWORDS = ["led", "lead", "managed", "mentored", "supervised", "directed", "architected", "owned"];

function scoreLeadership(resume: Resume, jd: JobDescription): number {
  const resumeText = resume.workExperience
    .flatMap((job) => [job.title, ...job.description])
    .join(" ")
    .toLowerCase();
  const hits = LEADERSHIP_KEYWORDS.filter((keyword) => resumeText.includes(keyword)).length;

  const jdWantsLeadership =
    jd.responsibilities.some((r) => LEADERSHIP_KEYWORDS.some((keyword) => r.toLowerCase().includes(keyword))) ||
    (jd.jobTitle ?? "").toLowerCase().includes("lead") ||
    (jd.jobTitle ?? "").toLowerCase().includes("manager");

  if (!jdWantsLeadership) return 100;

  return clamp(hits * 25);
}

function scoreCertification(resume: Resume, jd: JobDescription): number {
  if (jd.certifications.length === 0) return resume.certifications.length > 0 ? 100 : 80;

  const resumeCertNames = resume.certifications.map((cert) => cert.name);
  const result = matchKeywords(resumeCertNames, jd.certifications);

  return clamp((matchCredit(result) / jd.certifications.length) * 100);
}

function scoreCategoryAgainstJd(
  resume: Resume,
  jdCategorySkills: string[],
  dictionaryCategory: "AI" | "Cloud" | "Security"
): number {
  const resumeSkills = [...resume.skills, ...resume.technicalSkills];
  const dictionaryNames = TECHNOLOGY_DICTIONARY.filter((entry) => entry.category === dictionaryCategory).map(
    (entry) => entry.name
  );
  const resumeCategorySkills = matchKeywords(resumeSkills, dictionaryNames).matched;

  if (jdCategorySkills.length === 0) {
    return resumeCategorySkills.length > 0 ? 100 : 70;
  }

  const result = matchKeywords(resumeCategorySkills, jdCategorySkills);
  return clamp((matchCredit(result) / jdCategorySkills.length) * 100);
}

function scoreSoftSkills(resume: Resume, jd: JobDescription): number {
  if (jd.softSkills.length === 0) return 100;

  const result = matchKeywords(resume.softSkills, jd.softSkills);
  return clamp((matchCredit(result) / jd.softSkills.length) * 100);
}

/**
 * `experienceScore` is passed in (from experience-engine.ts, via
 * jd-matcher.ts) rather than recomputed here, so there's a single source
 * of truth for that formula instead of two implementations that could
 * drift apart.
 */
export function scoreAts(resume: Resume, jd: JobDescription, experienceScore: number): AtsCategoryScores {
  const scores: Omit<AtsCategoryScores, "overall"> = {
    keyword: scoreKeyword(resume, jd),
    experience: clamp(experienceScore),
    education: scoreEducation(resume, jd),
    formatting: scoreFormatting(resume),
    achievement: scoreAchievement(resume),
    project: scoreProject(resume, jd),
    leadership: scoreLeadership(resume, jd),
    certification: scoreCertification(resume, jd),
    aiSkills: scoreCategoryAgainstJd(resume, jd.aiSkills, "AI"),
    cloud: scoreCategoryAgainstJd(resume, jd.cloud, "Cloud"),
    security: scoreCategoryAgainstJd(resume, jd.security, "Security"),
    softSkills: scoreSoftSkills(resume, jd),
  };

  const overall = clamp(
    (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce(
      (sum, key) => sum + scores[key] * (WEIGHTS[key] / 100),
      0
    )
  );

  return { overall, ...scores };
}

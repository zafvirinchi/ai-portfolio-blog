import { Resume } from "../resume/resume-schema";
import { ExperienceMatch, JobDescription } from "./jd-schema";

// Deterministic experience matching: years, responsibilities, role-title,
// and domain overlap, combined into a score + Excellent/Good/Weak
// classification with a templated (not LLM-generated) reasoning sentence —
// same "deterministic explanation" pattern resume/resume-score.ts already
// established for its own buildExplanation(). The ExperienceMatch shape
// itself lives in jd-schema.ts (experienceMatchSchema) as the single
// source of truth — reused here rather than redeclared.

const STOPWORDS = new Set([
  "with",
  "that",
  "this",
  "from",
  "have",
  "will",
  "your",
  "team",
  "across",
  "using",
  "able",
  "the",
  "and",
  "for",
  "are",
  "was",
  "you",
  "our",
]);

function significantWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z0-9+#.]*/g)?.filter((word) => word.length > 3 && !STOPWORDS.has(word)) ?? [];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreYearsMatch(resumeYears: number | null, req: JobDescription["experienceRequired"]): number {
  if (req.minYears === null && req.maxYears === null) return 100;
  if (resumeYears === null) return 40;

  const min = req.minYears ?? 0;
  const max = req.maxYears ?? min + 5;

  if (resumeYears >= min && resumeYears <= max) return 100;
  if (resumeYears > max) return 90;

  const shortfall = min - resumeYears;
  return Math.max(0, 100 - shortfall * 20);
}

function scoreResponsibilitiesOverlap(resume: Resume, jd: JobDescription): number {
  if (jd.responsibilities.length === 0) return 100;

  const resumeText = resume.workExperience.flatMap((job) => job.description).join(" ").toLowerCase();

  let covered = 0;

  for (const responsibility of jd.responsibilities) {
    const words = significantWords(responsibility);
    if (words.length === 0) continue;

    const hits = words.filter((word) => resumeText.includes(word)).length;
    if (hits / words.length >= 0.4) covered++;
  }

  return clamp((covered / jd.responsibilities.length) * 100);
}

function scoreRoleTitleOverlap(resume: Resume, jd: JobDescription): number {
  if (!jd.jobTitle) return 100;

  const jdWords = significantWords(jd.jobTitle);
  if (jdWords.length === 0) return 100;

  const resumeTitles = resume.workExperience.map((job) => job.title).join(" ").toLowerCase();
  const hits = jdWords.filter((word) => resumeTitles.includes(word)).length;

  return clamp((hits / jdWords.length) * 100);
}

function scoreDomainOverlap(resume: Resume, jd: JobDescription): number {
  if (!jd.domain) return 100;

  const domainWords = significantWords(jd.domain);
  if (domainWords.length === 0) return 100;

  const resumeText = [
    resume.summary ?? "",
    ...resume.workExperience.flatMap((job) => job.description),
    ...resume.projects.map((project) => project.description ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  const hits = domainWords.filter((word) => resumeText.includes(word)).length;

  return clamp((hits / domainWords.length) * 100);
}

export function matchExperience(resume: Resume, jd: JobDescription): ExperienceMatch {
  const yearsScore = scoreYearsMatch(resume.yearsOfExperience, jd.experienceRequired);
  const responsibilitiesScore = scoreResponsibilitiesOverlap(resume, jd);
  const titleScore = scoreRoleTitleOverlap(resume, jd);
  const domainScore = scoreDomainOverlap(resume, jd);

  const score = clamp(yearsScore * 0.35 + responsibilitiesScore * 0.3 + titleScore * 0.2 + domainScore * 0.15);
  const level: ExperienceMatch["level"] = score >= 80 ? "Excellent" : score >= 55 ? "Good" : "Weak";

  const reasoningParts: string[] = [];

  if (jd.experienceRequired.raw) {
    reasoningParts.push(
      `The role asks for ${jd.experienceRequired.raw}; you have ${
        resume.yearsOfExperience ?? "an unstated amount of"
      } years of experience.`
    );
  }

  reasoningParts.push(
    responsibilitiesScore >= 60
      ? "Your experience covers most of the stated responsibilities."
      : "Several stated responsibilities aren't clearly reflected in your experience bullets."
  );

  reasoningParts.push(
    titleScore >= 60
      ? "Your role titles align with the job title."
      : "Your role titles differ noticeably from the job title."
  );

  if (jd.domain) {
    reasoningParts.push(
      domainScore >= 60
        ? `Your background shows relevant exposure to the ${jd.domain} domain.`
        : `Your resume doesn't clearly show experience in the ${jd.domain} domain.`
    );
  }

  return { level, score, reasoning: reasoningParts.join(" ") };
}

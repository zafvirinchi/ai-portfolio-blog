import { Resume } from "../resume/resume-schema";
import { scoreAts } from "./ats-engine";
import { matchExperience } from "./experience-engine";
import { EducationMatch, ExperienceMatch, JobDescription } from "./jd-schema";
import { AtsCategoryScores } from "./jd-types";
import { classifyCertificationRequirements, classifyEducationRequirements, KeywordMatchResult, matchCredit, matchKeywords } from "./keyword-engine";

// Orchestrates keyword + experience + ats-engine, plus education matching
// (Step 4 — small enough to live here rather than as its own file, per the
// spec's 10-file list). Everything here is deterministic; the only
// generative step is optimizer.ts, called separately by jd-service.ts.

/**
 * Phase 13 Milestone 17 — consolidated onto classifyEducationRequirements()/
 * classifyCertificationRequirements() (keyword-engine.ts), the same
 * per-item classifiers the Education/Certification proposal builder and
 * the JD-optimization review UI use. Previously this function computed
 * its own aggregate matched/missing lists via matchEducationRequirements()
 * + matchKeywords() + an inline "better alternative" filter — three
 * separate computations reaching the same conclusions the classifiers
 * now express directly. EducationMatch's external shape (matched/
 * missing/betterAlternatives) is unchanged; verified behavior-identical
 * against the existing jd-matcher/keyword-engine test suites before and
 * after this refactor. matchEducationRequirements() itself is untouched
 * and still used directly by ats-engine.ts's scoreEducation() (a
 * different aggregate shape — a percentage score, not a per-item
 * breakdown — consolidating that one too was judged unnecessary
 * regression risk for no behavior change; see Milestone 17's docs).
 */
function matchEducation(resume: Resume, jd: JobDescription): EducationMatch {
  const resumeDegrees = resume.education.map((entry) => entry.degree);
  const degreeResults = classifyEducationRequirements(resumeDegrees, jd.educationRequired);

  const resumeCertNames = resume.certifications.map((cert) => cert.name);
  const certResults = classifyCertificationRequirements(resumeCertNames, jd.certifications);

  return {
    matched: [...degreeResults.filter((result) => result.status !== "missing").map((result) => result.requirement), ...certResults.filter((result) => result.status === "matched").map((result) => result.requirement)],
    missing: [...degreeResults.filter((result) => result.status === "missing").map((result) => result.requirement), ...certResults.filter((result) => result.status === "missing").map((result) => result.requirement)],
    betterAlternatives: certResults.filter((result) => result.status === "related").map((result) => result.requirement),
  };
}

const CATEGORY_LABELS: Record<Exclude<keyof AtsCategoryScores, "overall">, string> = {
  keyword: "Keyword alignment",
  experience: "Experience fit",
  education: "Education match",
  formatting: "Resume formatting",
  achievement: "Quantified achievements",
  project: "Project relevance",
  leadership: "Leadership signal",
  certification: "Certifications",
  aiSkills: "AI/ML skills",
  cloud: "Cloud skills",
  security: "Security skills",
  softSkills: "Soft skills",
};

function deriveStrengthsAndWeaknesses(ats: AtsCategoryScores): { strengths: string[]; weaknesses: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const [key, label] of Object.entries(CATEGORY_LABELS) as [Exclude<keyof AtsCategoryScores, "overall">, string][]) {
    const score = ats[key];
    if (score >= 80) strengths.push(`${label} (${score}/100)`);
    else if (score < 50) weaknesses.push(`${label} (${score}/100)`);
  }

  return { strengths, weaknesses };
}

export interface JdMatchComputation {
  keywordMatch: KeywordMatchResult;
  experienceMatch: ExperienceMatch;
  educationMatch: EducationMatch;
  ats: AtsCategoryScores;
  overallMatch: number;
  strengths: string[];
  weaknesses: string[];
}

export function computeJdMatch(resume: Resume, jd: JobDescription): JdMatchComputation {
  const resumeSkills = [...resume.skills, ...resume.technicalSkills];
  const jdSkills = jd.skills.length > 0 ? jd.skills : [...jd.mandatorySkills, ...jd.goodToHaveSkills];

  const keywordMatch = matchKeywords(resumeSkills, jdSkills);
  const experienceMatch = matchExperience(resume, jd);
  const educationMatch = matchEducation(resume, jd);
  const ats = scoreAts(resume, jd, experienceMatch.score);
  const { strengths, weaknesses } = deriveStrengthsAndWeaknesses(ats);

  // Distinct from the ATS score (which simulates a parser's formatting/
  // keyword/achievement checks): this is a JD-fit composite skewed toward
  // what most directly determines "should this candidate apply" — keyword
  // coverage and experience fit, with education as a smaller factor.
  const overallMatch = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (jdSkills.length > 0 ? (matchCredit(keywordMatch) / jdSkills.length) * 100 : 100) * 0.45 +
          experienceMatch.score * 0.35 +
          ats.education * 0.2
      )
    )
  );

  return { keywordMatch, experienceMatch, educationMatch, ats, overallMatch, strengths, weaknesses };
}

import { Resume } from "../resume/resume-schema";
import { scoreAts } from "./ats-engine";
import { matchExperience } from "./experience-engine";
import { EducationMatch, ExperienceMatch, JobDescription } from "./jd-schema";
import { AtsCategoryScores } from "./jd-types";
import { KeywordMatchResult, matchKeywords } from "./keyword-engine";

// Orchestrates keyword + experience + ats-engine, plus education matching
// (Step 4 — small enough to live here rather than as its own file, per the
// spec's 10-file list). Everything here is deterministic; the only
// generative step is optimizer.ts, called separately by jd-service.ts.

function matchEducation(resume: Resume, jd: JobDescription): EducationMatch {
  const resumeDegrees = resume.education.map((entry) => entry.degree);
  const degreeMatch = matchKeywords(resumeDegrees, jd.educationRequired);

  const resumeCertNames = resume.certifications.map((cert) => cert.name);
  const certMatch = matchKeywords(resumeCertNames, jd.certifications);

  // "Better alternative": a missing JD cert where the resume has a
  // related-but-not-exact cert from the same vendor/area (same first
  // word) — flagged as a near-miss rather than a flat "missing".
  const betterAlternatives = certMatch.missing.filter((jdCert) =>
    resumeCertNames.some((resumeCert) => {
      const jdFirstWord = jdCert.toLowerCase().split(" ")[0] ?? "";
      const resumeFirstWord = resumeCert.toLowerCase().split(" ")[0] ?? "";
      return jdFirstWord.length > 3 && jdFirstWord === resumeFirstWord;
    })
  );

  return {
    matched: [...degreeMatch.matched, ...certMatch.matched],
    missing: [...degreeMatch.missing, ...certMatch.missing.filter((cert) => !betterAlternatives.includes(cert))],
    betterAlternatives,
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
        (jdSkills.length > 0 ? (keywordMatch.matched.length / jdSkills.length) * 100 : 100) * 0.45 +
          experienceMatch.score * 0.35 +
          ats.education * 0.2
      )
    )
  );

  return { keywordMatch, experienceMatch, educationMatch, ats, overallMatch, strengths, weaknesses };
}

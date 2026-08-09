import { AtsScore, Resume } from "../resume/resume-schema";
import { JdMatchResult } from "../job-description/jd-schema";
import { CandidateScoreBreakdown } from "./candidate-types";

// Deterministic, no LLM call. Every score comes from a real source —
// JdMatchResult once a candidate is matched against the workspace JD,
// else a resume-only fallback heuristic (never an LLM guess). See plan
// design decision 6: every field degrades to `null`/a resume-only
// estimate rather than being fabricated.

const CLOUD_KEYWORDS = ["aws", "azure", "gcp", "google cloud", "cloud"];
const AI_KEYWORDS = ["ai", "machine learning", "tensorflow", "pytorch", "llm", "openai", "nlp", "deep learning"];
const DEVOPS_KEYWORDS = ["docker", "kubernetes", "ci/cd", "cicd", "jenkins", "terraform", "ansible", "devops"];
const LEADERSHIP_VERBS = ["led", "managed", "mentored", "supervised", "directed", "coordinated", "spearheaded", "founded"];

function resumeCorpus(resume: Resume): string {
  return [
    resume.skills.join(" "),
    resume.technicalSkills.join(" "),
    resume.achievements.join(" "),
    resume.workExperience.flatMap((job) => job.description).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function keywordCoverageScore(corpus: string, keywords: string[]): number {
  const hits = keywords.filter((keyword) => corpus.includes(keyword)).length;
  return Math.round((hits / keywords.length) * 100);
}

function leadershipFallback(resume: Resume): number {
  const corpus = resumeCorpus(resume);
  const hits = LEADERSHIP_VERBS.filter((verb) => corpus.includes(verb)).length;
  return Math.min(100, hits * 25);
}

export function computeScoreBreakdown(params: {
  resume: Resume;
  resumeAtsScore: AtsScore;
  jdMatch: JdMatchResult | null;
  interviewReadiness: number | null;
}): CandidateScoreBreakdown {
  const { resume, resumeAtsScore, jdMatch, interviewReadiness } = params;
  const corpus = resumeCorpus(resume);

  const resumeScore = resumeAtsScore.overall;
  const atsScore = jdMatch?.atsScore ?? null;
  const jdMatchScore = jdMatch?.overallMatch ?? null;
  const experienceScore = jdMatch?.experienceScore ?? null;
  const skillsScore = jdMatch?.keywordScore ?? Math.min(100, resume.skills.length * 8);
  const projectsScore = jdMatch?.projectScore ?? (resume.projects.length > 0 ? Math.min(100, resume.projects.length * 25) : 0);
  const leadershipScore = jdMatch?.leadershipScore ?? leadershipFallback(resume);
  const communicationScore = jdMatch?.softSkillsScore ?? (resume.softSkills.length > 0 ? Math.min(100, resume.softSkills.length * 15) : 0);
  const cloudScore = jdMatch?.cloudScore ?? keywordCoverageScore(corpus, CLOUD_KEYWORDS);
  const aiScore = jdMatch?.aiScore ?? keywordCoverageScore(corpus, AI_KEYWORDS);
  // DevOps has no JdMatchResult field at all — always the local keyword
  // check, whether or not a JD match exists.
  const devOpsScore = keywordCoverageScore(corpus, DEVOPS_KEYWORDS);
  const certificationScore = jdMatch?.certificationScore ?? (resume.certifications.length > 0 ? Math.min(100, resume.certifications.length * 34) : 0);

  const contributing = [
    resumeScore,
    atsScore,
    jdMatchScore,
    experienceScore,
    skillsScore,
    projectsScore,
    leadershipScore,
    communicationScore,
    cloudScore,
    aiScore,
    devOpsScore,
    certificationScore,
    interviewReadiness,
  ].filter((value): value is number => value !== null);

  const overallScore = contributing.length > 0 ? Math.round(contributing.reduce((sum, v) => sum + v, 0) / contributing.length) : null;

  return {
    resumeScore,
    atsScore,
    jdMatch: jdMatchScore,
    experienceScore,
    skillsScore,
    projectsScore,
    leadershipScore,
    communicationScore,
    cloudScore,
    aiScore,
    devOpsScore,
    certificationScore,
    interviewReadiness,
    overallScore,
  };
}

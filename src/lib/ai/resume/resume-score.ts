import { AtsScore, Resume } from "./resume-schema";

// ATS (Applicant Tracking System) scoring is deliberately deterministic
// rather than another LLM call: real-world ATS software scores resumes via
// rule-based parsing/keyword checks, so a heuristic scorer is both more
// representative of what it's simulating and avoids a third LLM round trip
// per upload (extraction + analysis already account for two).

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

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

function scoreKeywords(resume: Resume): number {
  const uniqueSkills = new Set(
    [...resume.skills, ...resume.technicalSkills].map((skill) => skill.toLowerCase().trim())
  );

  return clamp(uniqueSkills.size * 6);
}

function scoreExperience(resume: Resume): number {
  const years = resume.yearsOfExperience ?? 0;

  let base = 0;
  if (years >= 10) base = 100;
  else if (years >= 6) base = 85;
  else if (years >= 3) base = 65;
  else if (years >= 1) base = 40;
  else base = resume.workExperience.length > 0 ? 20 : 0;

  const progressionBonus = resume.workExperience.length >= 2 ? 10 : 0;

  return clamp(base + progressionBonus);
}

function scoreSkills(resume: Resume): number {
  return clamp(resume.technicalSkills.length * 8 + resume.softSkills.length * 4);
}

function scoreEducation(resume: Resume): number {
  if (resume.education.length === 0) return 0;

  const base = 70 + Math.min(30, (resume.education.length - 1) * 15);

  return clamp(base);
}

function scoreCertification(resume: Resume): number {
  const count = resume.certifications.length;

  if (count === 0) return 0;
  if (count === 1) return 50;
  if (count === 2) return 75;

  return 100;
}

// Phase 15 Milestone 7 — exported (unchanged values, unchanged scoring
// behavior) so the ATS Explainability layer can compute an honest
// "maximum possible point gain from fully fixing this category"
// figure (§18) without a second, hand-copied weight table that could
// drift from the real one.
export const WEIGHTS = {
  formatting: 0.15,
  keyword: 0.25,
  experience: 0.2,
  skills: 0.2,
  education: 0.1,
  certification: 0.1,
} as const;

function verdictLabel(overall: number): string {
  if (overall >= 85) return "excellent ATS compatibility";
  if (overall >= 70) return "good ATS compatibility";
  if (overall >= 50) return "fair ATS compatibility, with room to improve";

  return "needs significant improvement for ATS compatibility";
}

function buildExplanation(scores: Omit<AtsScore, "explanation">): string {
  const sentences: string[] = [];

  sentences.push(
    `Overall ATS score: ${scores.overall}/100 — this resume shows ${verdictLabel(scores.overall)}.`
  );

  sentences.push(
    `Formatting scored ${scores.formatting}/100, based on contact detail completeness, ` +
      "presence of a summary, and whether work experience entries include bullet-point descriptions."
  );

  sentences.push(
    `Keyword score is ${scores.keyword}/100, based on the breadth of distinct skills listed — ` +
      "ATS software matches resumes primarily by keyword density against a job description."
  );

  sentences.push(
    `Experience score is ${scores.experience}/100, based on total years of experience and career progression ` +
      "across multiple roles."
  );

  sentences.push(
    `Skills score is ${scores.skills}/100, based on the number of distinct technical and soft skills detected.`
  );

  sentences.push(
    `Education score is ${scores.education}/100` +
      (scores.education === 0 ? ", since no education entries were found." : ".")
  );

  sentences.push(
    `Certification score is ${scores.certification}/100` +
      (scores.certification === 0
        ? ", since no certifications were listed — adding relevant certifications is one of the fastest ways to raise this score."
        : ".")
  );

  return sentences.join(" ");
}

export class ResumeScorer {
  score(resume: Resume): AtsScore {
    const formatting = scoreFormatting(resume);
    const keyword = scoreKeywords(resume);
    const experience = scoreExperience(resume);
    const skills = scoreSkills(resume);
    const education = scoreEducation(resume);
    const certification = scoreCertification(resume);

    const overall = clamp(
      formatting * WEIGHTS.formatting +
        keyword * WEIGHTS.keyword +
        experience * WEIGHTS.experience +
        skills * WEIGHTS.skills +
        education * WEIGHTS.education +
        certification * WEIGHTS.certification
    );

    const scores = { overall, formatting, keyword, experience, skills, education, certification };

    return {
      ...scores,
      explanation: buildExplanation(scores),
    };
  }
}

export const resumeScorer = new ResumeScorer();

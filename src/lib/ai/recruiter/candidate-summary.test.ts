import { describe, expect, it } from "vitest";

import { Resume } from "../resume/resume-schema";
import { JdMatchResult } from "../job-description/jd-schema";
import { buildRecruiterSummary } from "./candidate-summary";
import { CandidateScoreBreakdown } from "./candidate-types";

function baseResume(overrides: Partial<Resume> = {}): Resume {
  return {
    contact: { name: "Jane Doe", email: "jane@example.com", phone: null, location: null, linkedin: null, github: null, website: null },
    summary: "Experienced engineer.",
    skills: ["Java"],
    technicalSkills: ["Java", "Spring"],
    softSkills: [],
    workExperience: [],
    education: [],
    certifications: [],
    projects: [],
    achievements: [],
    languages: [],
    yearsOfExperience: 5,
    ...overrides,
  };
}

function scores(overrides: Partial<CandidateScoreBreakdown> = {}): CandidateScoreBreakdown {
  return {
    resumeScore: null,
    atsScore: null,
    jdMatch: null,
    experienceScore: null,
    skillsScore: null,
    projectsScore: null,
    leadershipScore: null,
    communicationScore: null,
    cloudScore: null,
    aiScore: null,
    devOpsScore: null,
    certificationScore: null,
    interviewReadiness: null,
    overallScore: null,
    ...overrides,
  };
}

function jdMatch(overrides: Partial<JdMatchResult> = {}): JdMatchResult {
  return {
    overallMatch: 80,
    atsScore: 80,
    keywordScore: 80,
    experienceScore: 80,
    educationScore: 80,
    formattingScore: 80,
    achievementScore: 80,
    projectScore: 80,
    leadershipScore: 80,
    certificationScore: 80,
    aiScore: 80,
    cloudScore: 80,
    securityScore: 80,
    softSkillsScore: 80,
    matchedSkills: [],
    partialSkills: [],
    missingSkills: [],
    additionalSkills: [],
    resumeStrengths: [],
    resumeWeaknesses: [],
    experienceMatch: { level: "Good", score: 80, reasoning: "test" },
    educationMatch: { matched: [], missing: [], betterAlternatives: [] },
    optimizedSummary: "",
    optimizedExperience: [],
    optimizedProjects: [],
    optimizedSkills: [],
    missingKeywordsSection: [],
    missingKeywords: [],
    improvementSuggestions: [],
    ...overrides,
  };
}

describe("buildRecruiterSummary — deterministic, zero LLM calls", () => {
  it("surfaces matched JD skills as strengths and missing ones as gaps, directly from JdMatchResult", () => {
    const result = buildRecruiterSummary(baseResume(), jdMatch({ matchedSkills: ["Java", "Spring Boot"], missingSkills: ["Kafka"] }), scores());

    expect(result.strengths).toContain("Java — matches the job description");
    expect(result.strengths).toContain("Spring Boot — matches the job description");
    expect(result.gaps).toContain("Kafka — not found on the resume");
  });

  it("adds a strength for a high (>= 85) score-breakdown dimension", () => {
    const result = buildRecruiterSummary(baseResume(), null, scores({ experienceScore: 92 }));
    expect(result.strengths.some((s) => s.includes("experience alignment"))).toBe(true);
  });

  it("does not add a strength for a merely-good (< 85) dimension", () => {
    const result = buildRecruiterSummary(baseResume(), null, scores({ experienceScore: 70 }));
    expect(result.strengths.some((s) => s.includes("experience alignment"))).toBe(false);
  });

  it("marks jdMatch as not_provided (never fabricating a match) when no JD match exists yet", () => {
    const result = buildRecruiterSummary(baseResume(), null, scores());
    expect(result.dataAvailability.jdMatch).toBe("not_provided");
    expect(result.gaps).toHaveLength(0); // no missing skills invented without a JD to compare against
  });

  it("reports missing sections as 'not_provided', never as a fabricated deficiency (§6)", () => {
    const result = buildRecruiterSummary(baseResume({ certifications: [], projects: [], education: [] }), null, scores());
    expect(result.dataAvailability.certifications).toBe("not_provided");
    expect(result.dataAvailability.projects).toBe("not_provided");
    expect(result.dataAvailability.education).toBe("not_provided");
    expect(result.gaps.some((g) => g.toLowerCase().includes("not certified"))).toBe(false); // never phrased as a shortcoming
  });

  it("reports a section as available when it has real content", () => {
    const result = buildRecruiterSummary(
      baseResume({ certifications: [{ name: "AWS Certified", issuer: null, date: null }], projects: [{ name: "X", description: null, technologies: [], url: null }], education: [{ degree: "B.Sc.", institution: "U", location: null, startDate: null, endDate: null, gpa: null }] }),
      null,
      scores()
    );
    expect(result.dataAvailability.certifications).toBe("available");
    expect(result.dataAvailability.projects).toBe("available");
    expect(result.dataAvailability.education).toBe("available");
  });
});
